// ============================================================================
// PANTURA IoT v2 — ESP32 + DHT11 + LCD + MQTT + Supabase Category Polling
// ============================================================================
// Perubahan dari v1:
// - Telegram DIHAPUS sepenuhnya
// - Kategori/mode diambil dari Supabase (diatur lewat web dashboard)
// - device_token ditambahkan ke payload MQTT
// - Hanya 1 FreeRTOS task (TaskSensor) + polling kategori
// ============================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <time.h>

// ─── KONFIGURASI WIFI ─────────────────────────────────────────────────────────
char ssid[] = "pentol";
char pass[] = "satelaler";

// ─── KONFIGURASI DEVICE ───────────────────────────────────────────────────────
// GANTI device_token ini sesuai dengan token yang didaftarkan di web dashboard
const char* DEVICE_TOKEN = "esp_1";

// ─── KONFIGURASI MQTT ─────────────────────────────────────────────────────────
const char* mqtt_server = "3f276da68e44490b855da20b9caa7a88.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_user = "admin_pantura";
const char* mqtt_pass = "Admin123";
const char* mqtt_topic = "pantura/sensor";

// ─── KONFIGURASI SUPABASE (untuk polling kategori) ────────────────────────────
const char* SUPABASE_URL = "https://stwhpggfudlcoubgaqeg.supabase.co";
const char* SUPABASE_ANON_KEY = "sb_publishable_coPQeXtYXY6Wb9PH6IIySw_FC2dP64n";

// ─── KONFIGURASI NTP ──────────────────────────────────────────────────────────
const char* ntpServer = "id.pool.ntp.org";
const long gmtOffset_sec = 25200; // WIB (UTC+7)
const int daylightOffset_sec = 0;

// ─── KONFIGURASI SENSOR & LCD ─────────────────────────────────────────────────
#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ─── VARIABEL GLOBAL ──────────────────────────────────────────────────────────
int category_id = 1;               // Mode aktif (1-4), di-update dari web
unsigned long timerDelay = 5000;    // Interval kirim data sensor (ms)
unsigned long pollInterval = 30000; // Interval polling kategori dari web (ms)
unsigned long lastPollTime = 0;

WiFiClientSecure net_mqtt;
PubSubClient mqtt_client(net_mqtt);

SemaphoreHandle_t xHardwareMutex;

// ─── NAMA MODE UNTUK LCD ─────────────────────────────────────────────────────
const char* getModeLabel(int mode) {
  switch (mode) {
    case 1: return "PC-AC Off  ";
    case 2: return "PC On      ";
    case 3: return "PC+AC On   ";
    case 4: return "AC On      ";
    default: return "Unknown    ";
  }
}

// ─── POLLING KATEGORI DARI SUPABASE ───────────────────────────────────────────
// Memanggil RPC function get_device_category() via Supabase REST API
// ESP membaca active_category_id yang diset dari web dashboard
void pollCategoryFromWeb() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // Skip SSL verification (untuk ESP32)
  HTTPClient http;

  String url = String(SUPABASE_URL) + "/rest/v1/rpc/get_device_category";

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");

  // Body: parameter untuk RPC function
  String body = "{\"p_device_token\":\"" + String(DEVICE_TOKEN) + "\"}";

  int httpCode = http.POST(body);

  if (httpCode == 200) {
    String response = http.getString();

    // Response format: [{"active_category_id": 3}]
    StaticJsonDocument<128> doc;
    DeserializationError err = deserializeJson(doc, response);

    if (!err && doc.is<JsonArray>() && doc.size() > 0) {
      int newCat = doc[0]["active_category_id"] | category_id;

      if (newCat >= 1 && newCat <= 4 && newCat != category_id) {
        category_id = newCat;
        Serial.printf("[WEB] Mode berubah ke: %d (%s)\n", category_id, getModeLabel(category_id));

        // Update LCD
        if (xSemaphoreTake(xHardwareMutex, portMAX_DELAY) == pdTRUE) {
          lcd.setCursor(0, 1);
          lcd.print("M:");
          lcd.print(category_id);
          lcd.print(" ");
          lcd.print(getModeLabel(category_id));
          xSemaphoreGive(xHardwareMutex);
        }
      }
    }
  } else {
    Serial.printf("[WEB] Poll gagal, HTTP: %d\n", httpCode);
  }

  http.end();
}

// ─── RECONNECT MQTT ───────────────────────────────────────────────────────────
void reconnect_mqtt() {
  while (!mqtt_client.connected()) {
    if (xSemaphoreTake(xHardwareMutex, portMAX_DELAY) == pdTRUE) {
      lcd.setCursor(0, 1);
      lcd.print("Conn MQTT...    ");
      xSemaphoreGive(xHardwareMutex);
    }

    String clientId = "ESP32_" + String(DEVICE_TOKEN);
    if (mqtt_client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("[MQTT] Connected");
      if (xSemaphoreTake(xHardwareMutex, portMAX_DELAY) == pdTRUE) {
        lcd.setCursor(0, 1);
        lcd.print("MQTT OK         ");
        xSemaphoreGive(xHardwareMutex);
      }
    } else {
      Serial.printf("[MQTT] Failed, rc=%d. Retry...\n", mqtt_client.state());
      vTaskDelay(2000 / portTICK_PERIOD_MS);
    }
  }
}

// ─── TASK SENSOR (FreeRTOS) ───────────────────────────────────────────────────
// Membaca sensor, mengirim data via MQTT, dan polling kategori dari web
void TaskSensor(void *pvParameters) {
  net_mqtt.setInsecure();
  mqtt_client.setServer(mqtt_server, mqtt_port);

  while (1) {
    // Reconnect MQTT jika terputus
    if (!mqtt_client.connected()) reconnect_mqtt();
    mqtt_client.loop();

    if (WiFi.status() == WL_CONNECTED) {
      // ── Polling kategori dari web (setiap pollInterval) ──────────────
      unsigned long now = millis();
      if (now - lastPollTime >= pollInterval) {
        lastPollTime = now;
        pollCategoryFromWeb();
      }

      // ── Baca sensor & kirim data ────────────────────────────────────
      float h = NAN;
      float t = NAN;
      struct tm timeinfo;
      bool timeReady = getLocalTime(&timeinfo);

      if (xSemaphoreTake(xHardwareMutex, portMAX_DELAY) == pdTRUE) {
        h = dht.readHumidity();
        t = dht.readTemperature();

        if (isnan(h) || isnan(t)) {
          lcd.setCursor(0, 0);
          lcd.print("DHT11 Error!    ");
        } else {
          lcd.setCursor(0, 0);
          lcd.print("T:");
          lcd.print(t, 1);
          lcd.print("C H:");
          lcd.print(h, 0);
          lcd.print("% ");
        }
        xSemaphoreGive(xHardwareMutex);
      }

      if (!isnan(h) && !isnan(t) && timeReady) {
        char isoTime[30];
        strftime(isoTime, sizeof(isoTime), "%Y-%m-%dT%H:%M:%S+07:00", &timeinfo);

        // JSON payload dengan device_token
        StaticJsonDocument<256> doc;
        doc["device_token"] = DEVICE_TOKEN;
        doc["suhu"] = t;
        doc["kelembapan"] = h;
        doc["category_id"] = category_id;
        doc["created_at"] = isoTime;

        char buffer[256];
        serializeJson(doc, buffer);
        mqtt_client.publish(mqtt_topic, buffer);

        Serial.printf("[MQTT] Sent: T=%.1f H=%.0f Cat=%d Token=%s\n", t, h, category_id, DEVICE_TOKEN);

        if (xSemaphoreTake(xHardwareMutex, portMAX_DELAY) == pdTRUE) {
          lcd.setCursor(0, 1);
          lcd.print("M:");
          lcd.print(category_id);
          lcd.print(" ");
          lcd.print(getModeLabel(category_id));
          xSemaphoreGive(xHardwareMutex);
        }
      } else if (!timeReady) {
        if (xSemaphoreTake(xHardwareMutex, portMAX_DELAY) == pdTRUE) {
          lcd.setCursor(0, 1);
          lcd.print("NTP Time Error! ");
          xSemaphoreGive(xHardwareMutex);
        }
      }
    }

    vTaskDelay(timerDelay / portTICK_PERIOD_MS);
  }
}

// ─── SETUP ────────────────────────────────────────────────────────────────────
void setup() {
  setCpuFrequencyMhz(240);
  Serial.begin(115200);

  xHardwareMutex = xSemaphoreCreateMutex();

  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();

  // Boot screen
  lcd.setCursor(0, 0);
  lcd.print("PANTURA v2      ");
  lcd.setCursor(0, 1);
  lcd.print("Booting...      ");
  delay(1500);

  // Init DHT
  lcd.setCursor(0, 1);
  lcd.print("Init DHT11...   ");
  dht.begin();
  delay(500);

  // Connect WiFi
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi ");
  lcd.setCursor(0, 1);
  lcd.print(ssid);

  WiFi.begin(ssid, pass);

  int dotCount = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    lcd.setCursor(strlen(ssid) + dotCount, 1);
    lcd.print(".");
    dotCount++;
    if (dotCount > 3) {
      lcd.setCursor(0, 1);
      lcd.print(ssid);
      lcd.print("    ");
      dotCount = 0;
    }
  }

  lcd.setCursor(0, 1);
  lcd.print("WiFi CONNECTED! ");
  Serial.printf("[WIFI] Connected to %s\n", ssid);
  Serial.printf("[WIFI] IP: %s\n", WiFi.localIP().toString().c_str());
  delay(1000);

  // Sync NTP
  lcd.setCursor(0, 0);
  lcd.print("Sync NTP Time   ");
  lcd.setCursor(0, 1);
  lcd.print("Please wait...  ");

  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

  struct tm timeinfo;
  int retryNTP = 0;
  while (!getLocalTime(&timeinfo) && retryNTP < 10) {
    delay(500);
    retryNTP++;
  }

  // Tampilkan info device
  lcd.setCursor(0, 0);
  lcd.print("Device:         ");
  lcd.setCursor(0, 1);
  lcd.print(DEVICE_TOKEN);
  delay(1500);

  // Polling kategori pertama kali dari web
  lcd.setCursor(0, 0);
  lcd.print("Sync Mode...    ");
  lcd.setCursor(0, 1);
  lcd.print("From web...     ");
  pollCategoryFromWeb();
  delay(500);

  // Ready
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("System Ready!   ");
  lcd.setCursor(0, 1);
  lcd.print("M:");
  lcd.print(category_id);
  lcd.print(" ");
  lcd.print(getModeLabel(category_id));
  delay(1000);

  lcd.clear();

  Serial.printf("[SYSTEM] Device Token: %s\n", DEVICE_TOKEN);
  Serial.printf("[SYSTEM] Initial Mode: %d\n", category_id);
  Serial.println("[SYSTEM] Starting sensor task...");

  // Hanya 1 task — tidak ada lagi TaskTelegram
  xTaskCreatePinnedToCore(TaskSensor, "TaskSensor", 16000, NULL, 2, NULL, 1);
}

void loop() {
  // Semua kerja dilakukan di FreeRTOS task
}
