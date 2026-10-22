plugins { id("com.android.application") }

val firebaseConfigured = file("google-services.json").exists()

if (firebaseConfigured) apply(plugin = "com.google.gms.google-services")

val previewOrigin =
    providers
        .gradleProperty("previewOrigin")
        .orElse("https://dinerdost-app.vercel.app")
        .get()
        .trimEnd('/')

require(
    previewOrigin.matches(
        Regex(
            "https://[a-zA-Z0-9.-]+(?::[0-9]+)?|http://(?:10\\.0\\.2\\.2|127\\.0\\.0\\.1|localhost):[0-9]+"
        )
    )
) {
    "previewOrigin must be an HTTPS origin, or an emulator/ADB loopback HTTP origin."
}

android {
    namespace = "com.dinerdost.app"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.dinerdost.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("boolean", "FIREBASE_CONFIGURED", firebaseConfigured.toString())
        buildConfigField("String", "APP_ORIGIN", "\"https://dinerdost-app.vercel.app\"")
        manifestPlaceholders["appLabel"] = "Diner Dost"
    }
    buildTypes {
        debug {
            buildConfigField("String", "APP_ORIGIN", "\"$previewOrigin\"")
            manifestPlaceholders["allowCleartext"] = previewOrigin.startsWith("http:").toString()
        }
        release {
            isMinifyEnabled = false
            manifestPlaceholders["allowCleartext"] = "false"
        }
    }
    flavorDimensions += "application"
    productFlavors {
        create("master") {
            dimension = "application"
            buildConfigField("String", "APPLICATION", "\"MASTER\"")
            buildConfigField("String", "PRODUCT_TITLE", "\"Diner Dost\"")
        }
        listOf(
            Triple("pos", "POS", "Diner Dost POS"),
            Triple("captain", "CAPTAIN", "Diner Dost Captain"),
            Triple("kitchen", "KITCHEN", "Diner Dost Kitchen"),
            Triple("bar", "BAR", "Diner Dost Bar"),
            Triple("command", "COMMAND", "Diner Dost Command"),
        ).forEach { (flavor, application, title) ->
            create(flavor) {
                dimension = "application"
                applicationIdSuffix = ".$flavor"
                buildConfigField("String", "APPLICATION", "\"$application\"")
                buildConfigField("String", "PRODUCT_TITLE", "\"$title\"")
                manifestPlaceholders["appLabel"] = title
            }
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity:1.12.4")
    implementation("androidx.work:work-runtime:2.11.2")
    implementation("com.google.firebase:firebase-messaging:26.0.0")
    implementation("com.google.zxing:core:3.5.4")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
}
