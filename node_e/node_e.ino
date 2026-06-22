#include "painlessMesh.h"
#include <ArduinoJson.h>

// --- MESH SETTINGS ---
#define MESH_PREFIX     "DisasterMesh"
#define MESH_PASSWORD   "Rescue1234"
#define MESH_PORT       5555
#define MY_NODE_ID      'E' // Gateway Node

Scheduler userScheduler;
painlessMesh mesh;

// Mesh Message Intercept
void receivedCallback(uint32_t from, String &msg) {
  // Instead of sending via WiFi, we simply print the raw JSON to the USB cable
  Serial.println(msg); 
}

void setup() {
  Serial.begin(115200);

  // Initialize Mesh (No WiFi setup needed!)
  mesh.setDebugMsgTypes(ERROR | STARTUP);  
  mesh.init(MESH_PREFIX, MESH_PASSWORD, &userScheduler, MESH_PORT);
  mesh.onReceive(&receivedCallback);
  
  Serial.println("{\"type\":\"SYSTEM\", \"payload\":\"Gateway Node E Ready. Awaiting Mesh Data...\"}");
}

void loop() {
  mesh.update();
}
