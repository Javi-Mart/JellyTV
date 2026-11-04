plugins {
	alias(libs.plugins.detekt)
	java
}

buildscript {
	dependencies {
		classpath(libs.android.gradle)
		classpath(libs.kotlin.gradle)
		classpath(libs.guava.build)
		classpath(platform("io.netty:netty-bom:4.1.137.Final"))
		constraints {
			add("classpath", "org.apache.commons:commons-compress:1.26.0")
			add("classpath", "org.apache.commons:commons-lang3:3.18.0")
			add("classpath", "org.bitbucket.b_c:jose4j:0.9.6")
			add("classpath", "org.bouncycastle:bcpkix-jdk18on:1.85")
			add("classpath", "org.bouncycastle:bcprov-jdk18on:1.85")
			add("classpath", "org.bouncycastle:bcutil-jdk18on:1.85")
			add("classpath", "org.jdom:jdom2:2.0.6.1")
		}
	}
}

java {
	toolchain {
		languageVersion.set(JavaLanguageVersion.of(libs.versions.java.jdk.get()))
	}
}

detekt {
	buildUponDefaultConfig = true
	ignoreFailures = true
	config.setFrom(files("$rootDir/detekt.yaml"))
	basePath = rootDir.absolutePath
	parallel = true

	source.setFrom(fileTree(projectDir) {
		include("**/*.kt", "**/*.kts")
	})
}

tasks.withType<io.gitlab.arturbosch.detekt.Detekt> {
	reports {
		sarif.required.set(true)
	}
}

subprojects {
	// Configure default Kotlin compiler options
	tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinJvmCompile> {
		compilerOptions {
			jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_1_8)
		}
	}

	// Configure default Android options
	plugins.withType<com.android.build.gradle.BasePlugin> {
		configure<com.android.build.gradle.BaseExtension> {
			compileOptions {
				sourceCompatibility = JavaVersion.VERSION_1_8
				targetCompatibility = JavaVersion.VERSION_1_8
			}
		}
	}
}

tasks.withType<Test> {
	// Ensure Junit emits the full stack trace when a unit test fails through gradle
	useJUnit()

	testLogging {
		events(
			org.gradle.api.tasks.testing.logging.TestLogEvent.FAILED,
			org.gradle.api.tasks.testing.logging.TestLogEvent.STANDARD_ERROR,
			org.gradle.api.tasks.testing.logging.TestLogEvent.SKIPPED
		)
		exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
		showExceptions = true
		showCauses = true
		showStackTraces = true
	}
}
