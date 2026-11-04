plugins {
	alias(libs.plugins.kotlin.jvm)
}

kotlin {
	jvmToolchain {
		languageVersion.set(JavaLanguageVersion.of(libs.versions.java.jdk.get()))
	}
	// Gradle 8.14 compiles its Kotlin DSL with Kotlin 2.0.
	compilerOptions {
		languageVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_0)
		apiVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_0)
	}
}

dependencies {
	implementation(gradleApi())
}

repositories {
	mavenCentral()
}
