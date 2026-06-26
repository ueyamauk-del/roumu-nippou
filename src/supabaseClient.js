import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gauhclpucrumctcxmepg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhdWhjbHB1Y3J1bWN0Y3htZXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTA2NDgsImV4cCI6MjA5NzU2NjY0OH0.86N0Sf_QS-wPZvYbB9BTiXClGbQNNfa_-KA-jA2soN8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
