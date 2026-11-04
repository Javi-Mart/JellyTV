package org.jellyfin.androidtv.ui.home

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.core.text.HtmlCompat
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.core.view.doOnPreDraw
import androidx.leanback.widget.Row
import androidx.leanback.widget.RowPresenter
import androidx.lifecycle.ViewModel
import androidx.lifecycle.Lifecycle
import coil3.ImageLoader
import coil3.asDrawable
import coil3.request.Disposable
import coil3.request.ImageRequest
import coil3.request.target
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.jellyfin.androidtv.R
import org.jellyfin.androidtv.auth.repository.UserRepository
import org.jellyfin.androidtv.data.repository.ItemMutationRepository
import org.jellyfin.androidtv.data.repository.ItemRepository
import org.jellyfin.androidtv.preference.UserPreferences
import org.jellyfin.androidtv.ui.AsyncImageView
import org.jellyfin.androidtv.ui.navigation.Destinations
import org.jellyfin.androidtv.ui.navigation.NavigationRepository
import org.jellyfin.androidtv.ui.playback.PlaybackLauncher
import org.jellyfin.androidtv.util.PlaybackHelper
import org.jellyfin.androidtv.util.apiclient.Response
import org.jellyfin.androidtv.util.apiclient.getUrl
import org.jellyfin.androidtv.util.apiclient.itemBackdropImages
import org.jellyfin.androidtv.util.apiclient.itemImages
import org.jellyfin.androidtv.util.apiclient.parentBackdropImages
import org.jellyfin.androidtv.util.apiclient.parentImages
import org.jellyfin.sdk.api.client.ApiClient
import org.jellyfin.sdk.api.client.extensions.tvShowsApi
import org.jellyfin.sdk.api.client.extensions.userLibraryApi
import org.jellyfin.sdk.model.api.BaseItemDto
import org.jellyfin.sdk.model.api.BaseItemKind
import org.jellyfin.sdk.model.api.ImageType
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Retained only with the owning Home fragment; never persists user media or tokens. */
class JellyTvHeroState : ViewModel() {
	var userId: UUID? = null
	var itemId: UUID? = null
	var focusKey = "play"
	var restoreFocus = false
}

/** A normal Leanback row: it scrolls out of the way and retains the existing TV focus bridge. */
class JellyTvHeroRow(val userId: UUID, val items: MutableList<BaseItemDto>) : Row() {
	var index = 0
	var onChanged: (() -> Unit)? = null
}

class JellyTvHeroPresenter(
	private val scope: CoroutineScope,
	private val lifecycle: Lifecycle,
	private val state: JellyTvHeroState,
) : RowPresenter(), KoinComponent {
	private val api by inject<ApiClient>()
	private val imageLoader by inject<ImageLoader>()
	private val users by inject<UserRepository>()
	private val mutations by inject<ItemMutationRepository>()
	private val navigation by inject<NavigationRepository>()
	private val playback by inject<PlaybackLauncher>()
	private val playbackHelper by inject<PlaybackHelper>()
	private val preferences by inject<UserPreferences>()

	init { headerPresenter = null }
	override fun isUsingDefaultSelectEffect() = false
	override fun createRowViewHolder(parent: ViewGroup): ViewHolder = HeroHolder(parent.context)
	override fun onBindRowViewHolder(holder: ViewHolder, item: Any) {
		super.onBindRowViewHolder(holder, item)
		(holder as HeroHolder).bind(item as JellyTvHeroRow)
	}
	override fun onUnbindRowViewHolder(holder: ViewHolder) {
		(holder as HeroHolder).unbind()
		super.onUnbindRowViewHolder(holder)
	}

	private inner class HeroHolder(val context: Context) : ViewHolder(FrameLayout(context)) {
		private val root = view as FrameLayout
		private val artwork = AsyncImageView(context)
		private val logo = ImageView(context)
		private val title = text(30, R.color.jellytv_text)
		private val metadata = text(14, R.color.jellytv_secondary)
		private val overview = text(16, R.color.jellytv_text)
		private val play = button(context.getString(R.string.lbl_play))
		private val info = button(context.getString(R.string.jellytv_info))
		private val favorite = button(context.getString(R.string.lbl_add_favorite))
		private val dots = LinearLayout(context)
		private val progress = ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal)
		private var row: JellyTvHeroRow? = null
		private var action: Job? = null
		private var bound = false
		private var logoRequest: Disposable? = null

		private fun dp(value: Int) = (value * context.resources.displayMetrics.density).toInt()
		private fun color(resource: Int) = ContextCompat.getColor(context, resource)
		private fun text(size: Int, color: Int) = TextView(context).apply {
			textSize = size.toFloat()
			setTextColor(ContextCompat.getColor(context, color))
			fontFeatureSettings = "kern"
			importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
		}
		private fun shape(fill: Int, stroke: Int = fill) = GradientDrawable().apply {
			cornerRadius = dp(22).toFloat()
			setColor(fill)
			setStroke(dp(2), stroke)
		}
		private fun button(label: String) = Button(context).apply {
			id = View.generateViewId()
			text = label
			isAllCaps = false
			textSize = 14f
			minWidth = dp(44)
			minimumWidth = dp(44)
			minHeight = dp(44)
			minimumHeight = dp(44)
			setPadding(dp(16), 0, dp(16), 0)
			background = StateListDrawable().apply {
				addState(intArrayOf(android.R.attr.state_focused), shape(color(R.color.jellytv_focus_surface), color(R.color.jellytv_focus)))
				addState(intArrayOf(android.R.attr.state_selected), shape(color(R.color.jellytv_elevated), color(R.color.jellytv_accent)))
				addState(intArrayOf(), shape(color(R.color.jellytv_surface)))
			}
			setTextColor(ColorStateList(
				arrayOf(intArrayOf(android.R.attr.state_focused), intArrayOf()),
				intArrayOf(color(R.color.jellytv_on_focus), color(R.color.jellytv_text)),
			))
		}

		init {
			root.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(300))
			root.setBackgroundColor(color(R.color.jellytv_background))
			root.descendantFocusability = ViewGroup.FOCUS_AFTER_DESCENDANTS
			artwork.scaleType = ImageView.ScaleType.CENTER_CROP
			// Leanback disables ancestor clipping for focus enlargement. Keep the
			// center-cropped backdrop inside its own bounds so it cannot cover rows.
			artwork.cropToPadding = true
			artwork.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
			root.addView(artwork, FrameLayout.LayoutParams(-1, -1))
			root.addView(View(context).apply {
				background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
					intArrayOf(Color.argb(245, 8, 9, 11), Color.argb(210, 8, 9, 11), Color.argb(45, 8, 9, 11)))
			}, FrameLayout.LayoutParams(-1, -1))
			root.addView(View(context).apply {
				background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
					intArrayOf(Color.TRANSPARENT, color(R.color.jellytv_background)))
			}, FrameLayout.LayoutParams(-1, dp(100), Gravity.BOTTOM))
			val copy = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
			root.addView(copy, FrameLayout.LayoutParams(dp(520), -2, Gravity.START or Gravity.TOP).apply {
				marginStart = dp(56); topMargin = dp(24)
			})
			val heading = FrameLayout(context)
			copy.addView(heading, LinearLayout.LayoutParams(-1, dp(52)))
			title.setTypeface(null, Typeface.BOLD)
			title.maxLines = 1
			title.ellipsize = TextUtils.TruncateAt.END
			heading.addView(title, FrameLayout.LayoutParams(-1, -1))
			logo.scaleType = ImageView.ScaleType.FIT_START
			heading.addView(logo, FrameLayout.LayoutParams(dp(320), -1))
			copy.addView(metadata, LinearLayout.LayoutParams(-1, dp(28)))
			overview.maxLines = 2
			overview.ellipsize = TextUtils.TruncateAt.END
			copy.addView(overview, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(6) })
			listOf(play to "play", info to "info", favorite to "favorite").forEach { (control, key) ->
				control.tag = key
				// Leanback initially focuses the first descendant when a row is rebound. Keep the
				// destination saved before navigation until our restoration has completed.
				control.setOnFocusChangeListener { _, focused -> if (focused && !state.restoreFocus) state.focusKey = key }
			}
			val actions = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
			for (control in listOf(play, info, favorite)) {
				actions.addView(control, LinearLayout.LayoutParams(-2, dp(44)).apply { marginEnd = dp(8) })
			}
			root.addView(actions, FrameLayout.LayoutParams(-2, dp(44), Gravity.START or Gravity.BOTTOM).apply {
				marginStart = dp(56); bottomMargin = dp(48)
			})
			progress.max = 1000
			progress.progressTintList = ColorStateList.valueOf(color(R.color.jellytv_accent))
			progress.progressBackgroundTintList = ColorStateList.valueOf(color(R.color.jellytv_elevated))
			root.addView(progress, FrameLayout.LayoutParams(dp(240), dp(4), Gravity.START or Gravity.BOTTOM).apply {
				marginStart = dp(56); bottomMargin = dp(34)
			})
			dots.orientation = LinearLayout.HORIZONTAL
			root.addView(dots, FrameLayout.LayoutParams(-2, dp(44), Gravity.END or Gravity.BOTTOM).apply {
				marginEnd = dp(56); bottomMargin = dp(48)
			})
			play.setOnClickListener { perform { item -> startPlayback(item) } }
			info.setOnClickListener {
				val selected = row ?: return@setOnClickListener
				if (users.currentUser.value?.id == selected.userId && action?.isActive != true) {
					state.restoreFocus = true
					navigation.navigate(Destinations.itemDetails(selected.items[selected.index].id))
				}
			}
			favorite.setOnClickListener { perform { item ->
				val data = mutations.setFavorite(item.id, item.userData?.isFavorite != true)
				val selected = row ?: return@perform
				val index = selected.items.indexOfFirst { it.id == item.id }
				if (index >= 0) selected.items[index] = item.copy(userData = data)
				render()
			} }
		}

		fun bind(value: JellyTvHeroRow) {
			row = value
			value.onChanged = ::render
			bound = true
			if (state.userId != value.userId) {
				state.userId = value.userId; state.itemId = null; state.focusKey = "play"; state.restoreFocus = false
			}
			value.index = value.items.indexOfFirst { it.id == state.itemId }.takeIf { it >= 0 } ?: value.index
			dots.removeAllViews()
			value.items.forEachIndexed { index, item ->
				val dot = button("•").apply {
					tag = "slide-$index"
					setOnFocusChangeListener { _, focused -> if (focused && !state.restoreFocus) state.focusKey = "slide-$index" }
					setPadding(0, 0, 0, 0)
					textSize = 22f
					contentDescription = context.getString(R.string.jellytv_slide, index + 1, value.items.size, item.name.orEmpty())
					setOnClickListener {
						if (action?.isActive != true) { value.index = index; render() }
					}
				}
				dots.addView(dot, LinearLayout.LayoutParams(dp(44), dp(44)).apply { marginStart = dp(4) })
			}
			render()
			root.doOnPreDraw {
				if (bound && state.restoreFocus) {
					root.findViewWithTag<View>(state.focusKey)?.requestFocus()
					state.restoreFocus = false
				}
			}
		}

		fun unbind() {
			bound = false
			action?.cancel()
			logoRequest?.dispose()
			artwork.load()
			row?.onChanged = null
			row = null
		}

		private fun render() {
			val selected = row ?: return
			val item = selected.items[selected.index]
			state.itemId = item.id
			title.text = item.name.orEmpty().take(200)
			val image = item.itemBackdropImages.firstOrNull() ?: item.parentBackdropImages.firstOrNull()
			artwork.load(url = image?.getUrl(api, maxWidth = 1920), aspectRatio = 16.0 / 9.0)
			val logoImage = item.itemImages[ImageType.LOGO] ?: item.parentImages[ImageType.LOGO]
			// Title remains visible while loading and on image errors; stale callbacks cannot change a later slide.
			logoRequest?.dispose()
			logo.isVisible = false
			title.isVisible = true
			logo.contentDescription = title.text
			if (logoImage != null) {
				logoRequest = imageLoader.enqueue(ImageRequest.Builder(context)
					.data(logoImage.getUrl(api, maxWidth = 640))
					.target(onSuccess = { image ->
						if (bound && row?.items?.getOrNull(row?.index ?: -1)?.id == item.id) {
							logo.setImageDrawable(image.asDrawable(context.resources))
							logo.isVisible = true
							title.isVisible = false
						}
					}).build())
			}
			metadata.text = listOfNotNull(item.productionYear?.toString(), item.officialRating,
				item.genres?.take(2)?.joinToString(" · ")?.takeIf { it.isNotBlank() }).joinToString(" · ")
			overview.text = HtmlCompat.fromHtml(item.overview.orEmpty().take(2000), HtmlCompat.FROM_HTML_MODE_LEGACY).toString().trim()
			val position = item.userData?.playbackPositionTicks ?: 0L
			play.text = context.getString(if (position > 0) R.string.jellytv_resume else R.string.lbl_play)
			favorite.text = context.getString(if (item.userData?.isFavorite == true) R.string.lbl_remove_favorite else R.string.lbl_add_favorite)
			val duration = item.runTimeTicks ?: 0L
			progress.isVisible = position > 0 && duration > 0
			progress.progress = if (duration > 0) ((position.toDouble() / duration).coerceIn(0.0, 1.0) * 1000).toInt() else 0
			for (index in 0 until dots.childCount) dots.getChildAt(index).isSelected = index == selected.index
		}

		private fun perform(block: suspend (BaseItemDto) -> Unit) {
			val selected = row ?: return
			if (!bound || action?.isActive == true || users.currentUser.value?.id != selected.userId) return
			val item = selected.items[selected.index]
			action = scope.launch {
				try { withTimeout(12_000) { block(item) } }
				catch (_: TimeoutCancellationException) {
					if (bound) Toast.makeText(context, R.string.jellytv_action_error, Toast.LENGTH_LONG).show()
				}
				catch (error: CancellationException) { throw error }
				catch (_: Exception) {
					if (bound) Toast.makeText(context, R.string.jellytv_action_error, Toast.LENGTH_LONG).show()
				}
			}
		}

		private suspend fun startPlayback(item: BaseItemDto) {
			val playable = withContext(Dispatchers.IO) {
				if (item.type == BaseItemKind.SERIES) {
					api.tvShowsApi.getNextUp(seriesId = item.id, limit = 1, fields = ItemRepository.itemFields).content.items.firstOrNull()
						?: api.tvShowsApi.getEpisodes(seriesId = item.id, isMissing = false, limit = 1, fields = ItemRepository.itemFields).content.items.firstOrNull()
				} else api.userLibraryApi.getItem(itemId = item.id).content
			} ?: throw IllegalStateException("No playable item")
			val preRoll = (preferences[UserPreferences.resumeSubtractDuration].toLongOrNull() ?: 0L) * 1000
			val position = ((playable.userData?.playbackPositionTicks ?: 0L) / 10_000 - preRoll).coerceIn(0, Int.MAX_VALUE.toLong()).toInt()
			val queue = suspendCancellableCoroutine { continuation ->
				@Suppress("DEPRECATION")
				playbackHelper.getItemsToPlay(context, playable, position == 0 && playable.type == BaseItemKind.MOVIE, false,
					object : Response<List<BaseItemDto>>(lifecycle) {
						override fun onResponse(response: List<BaseItemDto>) { if (continuation.isActive) continuation.resume(response) }
						override fun onError(exception: Exception) { if (continuation.isActive) continuation.resumeWithException(exception) }
					})
			}
			if (bound && lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) && users.currentUser.value?.id == row?.userId && queue.isNotEmpty()) {
				state.restoreFocus = true
				playback.launch(context, queue, position)
			}
		}
	}
}
