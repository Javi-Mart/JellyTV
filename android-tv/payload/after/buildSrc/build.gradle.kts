plugins {
	alias(libs.plugins.kotlin.jvm)
}

kotlin {
	jvmToolchain {
		languageVersion.set(JavaLanguageVersion.of(libs.versions.java.jdk.get()))
	}
	// Gradle 9.1 compiles its Kotlin DSL with Kotlin 2.2.
	compilerOptions {
		languageVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_2)
		apiVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_2)
	}
}

dependencies {
	implementation(gradleApi())
}

repositories {
	mavenCentral()
}
