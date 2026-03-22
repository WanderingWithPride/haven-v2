pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://github.com/nodejs-mobile/nodejs-mobile-android/raw/master/maven/") }
    }
}

rootProject.name = "CyberDeckServerApp"
include(":app")
