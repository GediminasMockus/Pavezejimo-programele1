-- Delete all existing trips and requests
DELETE FROM ride_requests WHERE 1=1;
DELETE FROM trips WHERE 1=1;

-- Insert test trips with real Lithuanian coordinates
INSERT INTO trips (role, from_location, from_lat, from_lng, to_location, to_lat, to_lng, departure_time, name, phone, seats, price, price_unit, car_color, car_make, car_plate, baggage, notes, is_recurring, status, created_by) VALUES
-- Driver trips
('driver', 'Vilnius, stotis', 54.6872, 25.2797, 'Kaunas, stotis', 54.8985, 23.9036, NOW() + INTERVAL '2 hours', 'Petras', '+37061234567', 4, 15, 'asmeniui', 'Juoda', 'Volkswagen', 'ABC123', 'Nėra', 'Važiuoju be sustojimų, galiu paimti prie stoties', false, 'active', NULL),
('driver', 'Vilnius, oro uostas', 54.6383, 25.2855, 'Klaipėda, jūrų uostas', 55.7167, 21.1167, NOW() + INTERVAL '5 hours', 'Jonas', '+37062345678', 3, 25, 'asmeniui', 'Pilka', 'Audi', 'DEF456', 'Vidutinis', 'Galiu paimti bagažą, važiuoju per Kauną', false, 'active', NULL),
('driver', 'Šiauliai, centras', 55.9346, 23.3128, 'Vilnius, stotis', 54.6872, 25.2797, NOW() + INTERVAL '24 hours', 'Antanas', '+37064567890', 4, 20, 'asmeniui', 'Mėlyna', 'BMW', 'GHI789', 'Didelis', 'Komfortiabilus automobilis, galiu paimti daug bagažo', true, 'active', NULL),
('driver', 'Klaipėda, centras', 55.7033, 21.1443, 'Palanga, oro uostas', 55.9217, 21.0694, NOW() + INTERVAL '6 hours', 'Kazys', '+37066789012', 2, 10, 'viso', 'Balta', 'Toyota', 'JKL012', 'Mažas', 'Trumpas maršrutas, galiu paimti prie centro', false, 'active', NULL),
-- Passenger trips
('passenger', 'Kaunas, Akademija', 54.9333, 23.9167, 'Vilnius, centras', 54.6872, 25.2797, NOW() + INTERVAL '3 hours', 'Ona', '+37063456789', 2, NULL, 'asmeniui', NULL, NULL, NULL, 'Mažas', 'Važiuoju su vienu draugu, bagažas tik kuprinės', false, 'active', NULL),
('passenger', 'Panevėžys, stotis', 55.7340, 24.3575, 'Kaunas, stotis', 54.8985, 23.9036, NOW() + INTERVAL '4 hours', 'Birutė', '+37065678901', 1, NULL, 'asmeniui', NULL, NULL, NULL, NULL, 'Ieškau patogios kelionės', false, 'active', NULL);
