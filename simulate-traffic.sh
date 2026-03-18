#!/bin/bash
# JWT Pizza Service - Traffic Simulator
# Generates traffic to populate all Grafana dashboard metrics with nonzero data
# Usage: ./simulate-traffic.sh [host]
# Default host: http://localhost:3000

HOST=${1:-"http://localhost:3000"}
echo "🍕 Simulating traffic against: $HOST"
echo "Press Ctrl+C to stop"
echo ""

# ── Login as admin ────────────────────────────────────────────────────────────
echo "Logging in as admin..."
ADMIN_RESPONSE=$(curl -s -X PUT "$HOST/api/auth" \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@jwt.com","password":"admin"}')
ADMIN_TOKEN=$(echo "$ADMIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Could not log in as admin. Make sure the service is running."
  echo "Response: $ADMIN_RESPONSE"
  exit 1
fi
echo "✅ Admin logged in"

# ── Register a test user ──────────────────────────────────────────────────────
echo "Registering test user..."
USER_RESPONSE=$(curl -s -X POST "$HOST/api/auth" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Diner","email":"testdiner@jwt.com","password":"diner123"}')
USER_TOKEN=$(echo "$USER_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$USER_TOKEN" ]; then
  # User may already exist, try logging in
  USER_RESPONSE=$(curl -s -X PUT "$HOST/api/auth" \
    -H 'Content-Type: application/json' \
    -d '{"email":"testdiner@jwt.com","password":"diner123"}')
  USER_TOKEN=$(echo "$USER_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
fi
echo "✅ Test user ready"

# ── Get franchise/store IDs ───────────────────────────────────────────────────
FRANCHISE_RESPONSE=$(curl -s "$HOST/api/franchise" -H "Authorization: Bearer $ADMIN_TOKEN")
FRANCHISE_ID=$(echo "$FRANCHISE_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
STORE_ID=$(echo "$FRANCHISE_RESPONSE" | grep -o '"stores":\[{"id":[0-9]*' | grep -o '[0-9]*$' | head -1)

echo "Franchise ID: $FRANCHISE_ID  Store ID: $STORE_ID"

# ── Get menu ──────────────────────────────────────────────────────────────────
MENU_RESPONSE=$(curl -s "$HOST/api/order/menu")
MENU_ID=$(echo "$MENU_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
MENU_PRICE=$(echo "$MENU_RESPONSE" | grep -o '"price":[0-9.]*' | head -1 | cut -d':' -f2)
echo "Menu item ID: $MENU_ID  Price: $MENU_PRICE"
echo ""

ROUND=0
while true; do
  ROUND=$((ROUND + 1))
  echo "── Round $ROUND ────────────────────────────────"

  # GET requests
  curl -s "$HOST/api/order/menu" > /dev/null
  curl -s "$HOST/api/franchise" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null

  # Successful auth (login + logout cycle for active users)
  NEW_TOKEN=$(curl -s -X PUT "$HOST/api/auth" \
    -H 'Content-Type: application/json' \
    -d '{"email":"testdiner@jwt.com","password":"diner123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

  # Failed auth attempts
  curl -s -X PUT "$HOST/api/auth" \
    -H 'Content-Type: application/json' \
    -d '{"email":"fake@jwt.com","password":"wrongpassword"}' > /dev/null
  curl -s -X PUT "$HOST/api/auth" \
    -H 'Content-Type: application/json' \
    -d '{"email":"nobody@jwt.com","password":"badpass"}' > /dev/null
  echo "  ✓ Auth attempts (success + failures)"

  # Pizza order (success)
  if [ -n "$FRANCHISE_ID" ] && [ -n "$STORE_ID" ] && [ -n "$MENU_ID" ]; then
    ORDER_RESPONSE=$(curl -s -X POST "$HOST/api/order" \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $USER_TOKEN" \
      -d "{\"franchiseId\":$FRANCHISE_ID,\"storeId\":$STORE_ID,\"items\":[{\"menuId\":$MENU_ID,\"description\":\"Veggie\",\"price\":$MENU_PRICE}]}")
    echo "  ✓ Pizza order placed"

    # Pizza order failure (too many pizzas triggers factory failure)
    ITEMS=""
    for i in $(seq 1 21); do
      if [ -n "$ITEMS" ]; then ITEMS="$ITEMS,"; fi
      ITEMS="$ITEMS{\"menuId\":$MENU_ID,\"description\":\"Veggie\",\"price\":$MENU_PRICE}"
    done
    curl -s -X POST "$HOST/api/order" \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer $USER_TOKEN" \
      -d "{\"franchiseId\":$FRANCHISE_ID,\"storeId\":$STORE_ID,\"items\":[$ITEMS]}" > /dev/null
    echo "  ✓ Pizza failure triggered (21-item order)"
  else
    echo "  ⚠ Skipping orders (no franchise/store found)"
  fi

  # Logout to cycle active users
  if [ -n "$NEW_TOKEN" ]; then
    curl -s -X DELETE "$HOST/api/auth" \
      -H "Authorization: Bearer $NEW_TOKEN" > /dev/null
    echo "  ✓ User logout"
  fi

  echo "  Sleeping 15s before next round..."
  sleep 15
done
