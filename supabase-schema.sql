-- Enable PostGIS extension for geographic queries
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'passenger' CHECK (role IN ('passenger', 'driver', 'admin')),
  phone_number TEXT,
  language TEXT DEFAULT 'es' CHECK (language IN ('es', 'ca', 'en')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drivers table
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  taxi_id UUID NOT NULL,
  current_lat DECIMAL(10, 8),
  current_lng DECIMAL(11, 8),
  status TEXT DEFAULT 'offline' CHECK (status IN ('available', 'busy', 'offline')),
  rating DECIMAL(3, 2) DEFAULT 5.0,
  total_rides INTEGER DEFAULT 0,
  total_earnings DECIMAL(10, 2) DEFAULT 0,
  current_zone_id UUID,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Passengers table
CREATE TABLE IF NOT EXISTS public.passengers (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  rating DECIMAL(3, 2) DEFAULT 5.0,
  total_rides INTEGER DEFAULT 0,
  favorite_locations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Taxis table
CREATE TABLE IF NOT EXISTS public.taxis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_plate TEXT NOT NULL UNIQUE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_model TEXT,
  vehicle_color TEXT,
  capacity INTEGER DEFAULT 4,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'retired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rides table
CREATE TABLE IF NOT EXISTS public.rides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  passenger_id UUID NOT NULL REFERENCES public.passengers(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  taxi_id UUID REFERENCES public.taxis(id) ON DELETE SET NULL,
  pickup_lat DECIMAL(10, 8) NOT NULL,
  pickup_lng DECIMAL(11, 8) NOT NULL,
  dropoff_lat DECIMAL(10, 8) NOT NULL,
  dropoff_lng DECIMAL(11, 8) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
  estimated_fare DECIMAL(10, 2),
  actual_fare DECIMAL(10, 2),
  estimated_duration INTEGER, -- in minutes
  actual_duration INTEGER, -- in minutes
  payment_method TEXT DEFAULT 'card' CHECK (payment_method IN ('card', 'cash', 'wallet')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Queue zones table
CREATE TABLE IF NOT EXISTS public.queue_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  radius_km DECIMAL(5, 2) DEFAULT 1.0,
  max_queue_size INTEGER DEFAULT 50,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Driver queues table (FIFO queue system)
CREATE TABLE IF NOT EXISTS public.driver_queues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES public.queue_zones(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  entered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(driver_id, zone_id)
);

-- Ratings table
CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rated_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_drivers_status ON public.drivers(status);
CREATE INDEX idx_drivers_location ON public.drivers USING GIST (ST_Point(current_lng, current_lat));
CREATE INDEX idx_rides_passenger_id ON public.rides(passenger_id);
CREATE INDEX idx_rides_driver_id ON public.rides(driver_id);
CREATE INDEX idx_rides_status ON public.rides(status);
CREATE INDEX idx_rides_created_at ON public.rides(created_at);
CREATE INDEX idx_driver_queues_zone_id ON public.driver_queues(zone_id);
CREATE INDEX idx_driver_queues_driver_id ON public.driver_queues(driver_id);
CREATE INDEX idx_ratings_ride_id ON public.ratings(ride_id);

-- Create function to find nearest drivers
CREATE OR REPLACE FUNCTION find_nearest_drivers(
  user_lat DECIMAL,
  user_lng DECIMAL,
  radius_km DECIMAL DEFAULT 5
)
RETURNS TABLE (
  driver_id UUID,
  distance_km DECIMAL,
  rating DECIMAL,
  current_lat DECIMAL,
  current_lng DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    ROUND(
      ST_Distance(
        ST_Point(user_lng, user_lat)::geography,
        ST_Point(d.current_lng, d.current_lat)::geography
      ) / 1000,
      2
    )::DECIMAL as distance_km,
    d.rating,
    d.current_lat,
    d.current_lng
  FROM public.drivers d
  WHERE
    d.status = 'available'
    AND d.current_lat IS NOT NULL
    AND d.current_lng IS NOT NULL
    AND ST_DWithin(
      ST_Point(user_lng, user_lat)::geography,
      ST_Point(d.current_lng, d.current_lat)::geography,
      radius_km * 1000
    )
  ORDER BY distance_km ASC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for drivers table
CREATE POLICY "Drivers can view their own data" ON public.drivers
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Drivers can update their own data" ON public.drivers
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for passengers table
CREATE POLICY "Passengers can view their own data" ON public.passengers
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Passengers can update their own data" ON public.passengers
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for rides table
CREATE POLICY "Users can view their own rides" ON public.rides
  FOR SELECT USING (
    auth.uid() = passenger_id OR auth.uid() = driver_id
  );

CREATE POLICY "Passengers can create rides" ON public.rides
  FOR INSERT WITH CHECK (auth.uid() = passenger_id);

-- RLS Policies for ratings table
CREATE POLICY "Users can view ratings for their rides" ON public.ratings
  FOR SELECT USING (
    auth.uid() = rater_id OR auth.uid() = rated_id
  );

CREATE POLICY "Users can create ratings" ON public.ratings
  FOR INSERT WITH CHECK (auth.uid() = rater_id);

-- Create realtime subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_queues;
