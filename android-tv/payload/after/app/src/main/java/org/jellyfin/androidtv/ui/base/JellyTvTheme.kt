package org.jellyfin.androidtv.ui.base

import android.util.TypedValue
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.dimensionResource
import org.jellyfin.androidtv.R

/** Resolve the activity's applied theme, including the player's existing lifecycle rules. */
@Composable
fun isJellyTvTheme(): Boolean {
	val value = TypedValue()
	return LocalContext.current.theme.resolveAttribute(R.attr.jellyTvTheme, value, true) && value.data != 0
}

@Composable
fun nativeColorScheme(): ColorScheme = if (!isJellyTvTheme()) JellyfinTheme.colorScheme else ColorScheme(
	background = colorResource(R.color.jellytv_background),
	onBackground = colorResource(R.color.jellytv_text),
	button = colorResource(R.color.jellytv_surface),
	onButton = colorResource(R.color.jellytv_text),
	buttonFocused = colorResource(R.color.jellytv_focus_surface),
	onButtonFocused = colorResource(R.color.jellytv_on_focus),
	buttonDisabled = colorResource(R.color.jellytv_disabled),
	onButtonDisabled = colorResource(R.color.jellytv_on_disabled),
	buttonActive = colorResource(R.color.jellytv_elevated),
	onButtonActive = colorResource(R.color.jellytv_text),
	input = colorResource(R.color.jellytv_surface),
	onInput = colorResource(R.color.jellytv_text),
	inputFocused = colorResource(R.color.jellytv_elevated),
	onInputFocused = colorResource(R.color.jellytv_text),
	recording = colorResource(R.color.jellytv_recording),
	onRecording = colorResource(R.color.jellytv_text),
	popover = colorResource(R.color.jellytv_surface),
)

@Composable
fun nativeShapes(): Shapes = if (!isJellyTvTheme()) JellyfinTheme.shapes else Shapes(
	extraSmall = RoundedCornerShape(dimensionResource(R.dimen.jellytv_radius_small)),
	small = RoundedCornerShape(dimensionResource(R.dimen.jellytv_radius_small)),
	medium = RoundedCornerShape(dimensionResource(R.dimen.jellytv_radius_medium)),
	large = RoundedCornerShape(dimensionResource(R.dimen.jellytv_radius_large)),
)
