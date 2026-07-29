-- Local-only development seed.
-- Contains fake data and is safe to re-run against the local Wrangler D1 store.

INSERT INTO properties (
  beds24_property_id,
  property_name,
  timezone,
  currency,
  active,
  raw_json,
  created_at,
  updated_at
) VALUES (
  999001,
  'Vanara Local Dev',
  'Asia/Bangkok',
  'THB',
  1,
  '{"source":"local-dev-seed"}',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(beds24_property_id) DO UPDATE SET
  property_name = excluded.property_name,
  timezone = excluded.timezone,
  currency = excluded.currency,
  active = excluded.active,
  raw_json = excluded.raw_json,
  updated_at = datetime('now');

INSERT INTO room_types (
  beds24_room_id,
  property_id,
  room_name,
  room_type_code,
  room_type_name,
  max_people,
  active,
  raw_json,
  created_at,
  updated_at
) VALUES (
  999101,
  (SELECT property_id FROM properties WHERE beds24_property_id = 999001),
  'Local Bungalow',
  'LOCAL-BUNGALOW',
  'Local Bungalow',
  2,
  1,
  '{"source":"local-dev-seed"}',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(beds24_room_id) DO UPDATE SET
  property_id = excluded.property_id,
  room_name = excluded.room_name,
  room_type_code = excluded.room_type_code,
  room_type_name = excluded.room_type_name,
  max_people = excluded.max_people,
  active = excluded.active,
  raw_json = excluded.raw_json,
  updated_at = datetime('now');

INSERT INTO units (
  room_type_id,
  beds24_unit_id,
  unit_name,
  unit_type,
  active,
  raw_json,
  created_at,
  updated_at
) VALUES (
  (SELECT room_type_id FROM room_types WHERE beds24_room_id = 999101),
  1,
  'Local Bungalow 1',
  'bungalow',
  1,
  '{"source":"local-dev-seed"}',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(room_type_id, beds24_unit_id) DO UPDATE SET
  unit_name = excluded.unit_name,
  unit_type = excluded.unit_type,
  active = excluded.active,
  raw_json = excluded.raw_json,
  updated_at = datetime('now');

INSERT INTO offers (
  room_type_id,
  beds24_offer_id,
  offer_name,
  booking_type,
  active,
  raw_json,
  created_at,
  updated_at
) VALUES (
  (SELECT room_type_id FROM room_types WHERE beds24_room_id = 999101),
  1,
  'Local Flexible',
  'confirmed',
  1,
  '{"source":"local-dev-seed"}',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(room_type_id, beds24_offer_id) DO UPDATE SET
  offer_name = excluded.offer_name,
  booking_type = excluded.booking_type,
  active = excluded.active,
  raw_json = excluded.raw_json,
  updated_at = datetime('now');

INSERT INTO bookings (
  beds24_booking_id,
  property_id,
  room_type_id,
  unit_id,
  offer_id,
  status,
  arrival_date,
  departure_date,
  adults,
  children,
  first_name,
  last_name,
  guest_name,
  api_source,
  raw_json,
  created_at,
  updated_at
) VALUES (
  9999001,
  (SELECT property_id FROM properties WHERE beds24_property_id = 999001),
  (SELECT room_type_id FROM room_types WHERE beds24_room_id = 999101),
  (
    SELECT unit_id
    FROM units
    WHERE room_type_id = (SELECT room_type_id FROM room_types WHERE beds24_room_id = 999101)
      AND beds24_unit_id = 1
  ),
  (
    SELECT offer_id
    FROM offers
    WHERE room_type_id = (SELECT room_type_id FROM room_types WHERE beds24_room_id = 999101)
      AND beds24_offer_id = 1
  ),
  'confirmed',
  date('now'),
  date('now', '+1 day'),
  2,
  0,
  'Local',
  'Guest',
  'Local Guest',
  'local-dev',
  '{"source":"local-dev-seed"}',
  datetime('now'),
  datetime('now')
)
ON CONFLICT(beds24_booking_id) DO UPDATE SET
  property_id = excluded.property_id,
  room_type_id = excluded.room_type_id,
  unit_id = excluded.unit_id,
  offer_id = excluded.offer_id,
  status = excluded.status,
  arrival_date = excluded.arrival_date,
  departure_date = excluded.departure_date,
  adults = excluded.adults,
  children = excluded.children,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  guest_name = excluded.guest_name,
  api_source = excluded.api_source,
  raw_json = excluded.raw_json,
  updated_at = datetime('now');

INSERT INTO unit_availability_cache (
  property_id,
  room_type_id,
  unit_id,
  stay_date,
  availability,
  closed,
  minimum_stay,
  maximum_stay,
  restrictions,
  raw_json,
  synced_at,
  created_at,
  updated_at
) VALUES (
  (SELECT property_id FROM properties WHERE beds24_property_id = 999001),
  (SELECT room_type_id FROM room_types WHERE beds24_room_id = 999101),
  (
    SELECT unit_id
    FROM units
    WHERE room_type_id = (SELECT room_type_id FROM room_types WHERE beds24_room_id = 999101)
      AND beds24_unit_id = 1
  ),
  date('now'),
  0,
  0,
  1,
  14,
  '{"source":"local-dev-seed"}',
  '{"source":"local-dev-seed","note":"Sample unit is unavailable because the local sample booking occupies it today."}',
  datetime('now'),
  datetime('now'),
  datetime('now')
)
ON CONFLICT(unit_id, stay_date) DO UPDATE SET
  property_id = excluded.property_id,
  room_type_id = excluded.room_type_id,
  availability = excluded.availability,
  closed = excluded.closed,
  minimum_stay = excluded.minimum_stay,
  maximum_stay = excluded.maximum_stay,
  restrictions = excluded.restrictions,
  raw_json = excluded.raw_json,
  synced_at = excluded.synced_at,
  updated_at = datetime('now');

-- Local chat seed: fake operational data persisted through D1, never used as frontend source of truth.
INSERT INTO chat_messages (
  conversation_id,
  author_id,
  author_display_name,
  author_role,
  body,
  body_language,
  translated_body,
  translated_language,
  created_at
)
SELECT
  'general-operations',
  'local-reception',
  'Reception',
  'Operations',
  'Morning handover is open. Use this space for real operational notes during local development.',
  'en',
  'เปิดส่งต่องานตอนเช้า ใช้พื้นที่นี้สำหรับบันทึกงานระหว่างการพัฒนาในเครื่อง',
  'th',
  datetime('now')
WHERE EXISTS (
  SELECT 1 FROM chat_conversations WHERE conversation_id = 'general-operations'
)
AND NOT EXISTS (
  SELECT 1 FROM chat_messages
  WHERE conversation_id = 'general-operations'
    AND author_id = 'local-reception'
    AND body = 'Morning handover is open. Use this space for real operational notes during local development.'
);