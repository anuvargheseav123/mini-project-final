/*
  # Flood Rehabilitation Project Database Schema

  1. New Tables
    - `users`
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `name` (text)
      - `role` (text, either 'refugee' or 'volunteer')
      - `age` (integer)
      - `contact` (text)
      - `address` (text, nullable for volunteers)
      - `needs` (text, nullable for volunteers)
      - `skills` (text, nullable for refugees)
      - `availability` (text, nullable for refugees)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `camps`
      - `id` (uuid, primary key)
      - `name` (text)
      - `beds` (integer)
      - `original_beds` (integer)
      - `resources` (text array)
      - `contact` (text, nullable)
      - `ambulance` (text)
      - `type` (text, default or volunteer-added)
      - `added_by` (uuid, foreign key to users)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `camp_selections`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `camp_id` (uuid, foreign key to camps)
      - `selected_at` (timestamp)

    - `volunteer_assignments`
      - `id` (uuid, primary key)
      - `volunteer_id` (uuid, foreign key to users)
      - `camp_id` (uuid, foreign key to camps)
      - `assigned_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Add policies for volunteers to manage camps
    - Add policies for users to view camps and make selections

  3. Functions
    - Function to automatically update camp bed count when selections are made/cancelled
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('refugee', 'volunteer')),
  age integer NOT NULL,
  contact text NOT NULL,
  address text,
  needs text,
  skills text,
  availability text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create camps table
CREATE TABLE IF NOT EXISTS camps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  beds integer NOT NULL DEFAULT 0,
  original_beds integer NOT NULL DEFAULT 0,
  resources text[] DEFAULT '{}',
  contact text,
  ambulance text DEFAULT 'No',
  type text DEFAULT 'default' CHECK (type IN ('default', 'volunteer-added')),
  added_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create camp_selections table
CREATE TABLE IF NOT EXISTS camp_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  selected_at timestamptz DEFAULT now(),
  UNIQUE(user_id) -- Each user can only have one active selection
);

-- Create volunteer_assignments table
CREATE TABLE IF NOT EXISTS volunteer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  camp_id uuid NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE camps ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_assignments ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id::text);

CREATE POLICY "Anyone can create user"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Camps policies
CREATE POLICY "Anyone can read camps"
  ON camps
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Volunteers can create camps"
  ON camps
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'volunteer'
    )
  );

CREATE POLICY "Volunteers can update camps they created"
  ON camps
  FOR UPDATE
  TO authenticated
  USING (
    added_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'volunteer'
    )
  );

CREATE POLICY "Volunteers can delete camps they created"
  ON camps
  FOR DELETE
  TO authenticated
  USING (
    added_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'volunteer'
    )
  );

-- Camp selections policies
CREATE POLICY "Users can read own selections"
  ON camp_selections
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own selections"
  ON camp_selections
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own selections"
  ON camp_selections
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Volunteer assignments policies
CREATE POLICY "Volunteers can read own assignments"
  ON volunteer_assignments
  FOR SELECT
  TO authenticated
  USING (volunteer_id = auth.uid());

CREATE POLICY "Volunteers can create own assignments"
  ON volunteer_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    volunteer_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'volunteer'
    )
  );

-- Function to update camp beds when selection is made
CREATE OR REPLACE FUNCTION update_camp_beds()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Decrease bed count when selection is made
    UPDATE camps 
    SET beds = beds - 1, updated_at = now()
    WHERE id = NEW.camp_id AND beds > 0;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Increase bed count when selection is cancelled
    UPDATE camps 
    SET beds = beds + 1, updated_at = now()
    WHERE id = OLD.camp_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for camp bed updates
DROP TRIGGER IF EXISTS camp_selection_bed_update ON camp_selections;
CREATE TRIGGER camp_selection_bed_update
  AFTER INSERT OR DELETE ON camp_selections
  FOR EACH ROW
  EXECUTE FUNCTION update_camp_beds();

-- Insert default camps
INSERT INTO camps (name, beds, original_beds, resources, contact, ambulance, type) VALUES
  ('Central School Grounds', 24, 24, ARRAY['Food', 'Water', 'Medical Aid', 'Blankets'], '+91 98765 43210', 'Yes', 'default'),
  ('Community Hall', 12, 12, ARRAY['Food', 'Water', 'Blankets', 'Clothing'], '+91 98765 11223', 'Nearby', 'default'),
  ('Government High School', 30, 30, ARRAY['Food', 'Water', 'First Aid', 'Hygiene Kits'], '+91 98765 77889', 'Yes', 'default')
ON CONFLICT DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_camps_updated_at BEFORE UPDATE ON camps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();