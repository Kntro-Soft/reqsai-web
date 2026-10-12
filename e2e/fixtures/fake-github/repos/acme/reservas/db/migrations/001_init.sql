CREATE TABLE reservations (id uuid primary key, name text, email text, people int, starts_at timestamptz, status text);
CREATE TABLE payments (id uuid primary key, reservation_id uuid references reservations(id), method text, amount numeric);
CREATE TABLE dishes (id uuid primary key, name text, price numeric, available boolean, vegetarian boolean);
