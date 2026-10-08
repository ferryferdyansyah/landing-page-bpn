/* Klien Supabase. Publishable key aman di frontend; keamanan data diatur oleh RLS. */
const SUPABASE_URL = "https://eiisdohzszhdskmlctzs.supabase.co";
const SUPABASE_KEY = "sb_publishable_QDY9jbUW3Ce1Hz4bOAgBnQ_91lCp4h1";

// `supabase` (global) berasal dari CDN @supabase/supabase-js
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);