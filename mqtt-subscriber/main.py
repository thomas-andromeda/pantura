import os
import ssl
import json
import requests
import paho.mqtt.client as mqtt

# Load environment variables with fallbacks
MQTT_BROKER = os.getenv("MQTT_BROKER", "3f276da68e44490b855da20b9caa7a88.s1.eu.hivemq.cloud")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USER = os.getenv("MQTT_USER", "admin_pantura")
MQTT_PASS = os.getenv("MQTT_PASS", "Admin123")
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "pantura/sensor")

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://stwhpggfudlcoubgaqeg.supabase.co/rest/v1/sensor_data")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[MQTT] Connected successfully to broker! Subscribing to: {MQTT_TOPIC}")
        client.subscribe(MQTT_TOPIC)
    else:
        print(f"[MQTT] Connection failed with return code {rc}")

def on_message(client, userdata, msg):
    try:
        payload = msg.payload.decode()
        print(f"[MQTT] Message received on topic '{msg.topic}': {payload}")
        
        # Parse JSON payload
        data = json.loads(payload)
        
        # Forward data to Supabase REST API
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        
        response = requests.post(SUPABASE_URL, json=data, headers=headers)
        if response.status_code in [200, 201]:
            print("[SUPABASE] Data successfully inserted into sensor_data table.")
        else:
            print(f"[SUPABASE] Insertion failed. Code: {response.status_code}, Response: {response.text}")
            
    except Exception as e:
        print(f"[ERROR] Failed to process message: {str(e)}")

# Initialize client compatible with both paho-mqtt v1 and v2
try:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
except AttributeError:
    client = mqtt.Client()

client.username_pw_set(MQTT_USER, MQTT_PASS)

# SSL/TLS setup (Required for HiveMQ Cloud Secure Port 8883)
context = ssl.create_default_context()
client.tls_set_context(context)

client.on_connect = on_connect
client.on_message = on_message

print(f"[SYSTEM] Connecting to HiveMQ Cloud broker at {MQTT_BROKER}:{MQTT_PORT}...")
client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)

# Loop forever
client.loop_forever()
