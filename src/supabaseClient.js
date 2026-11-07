import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://epwpxosgcizhhljtjwuu.supabase.co';
const supabaseAnonKey = 'sb_publishable_B-9ugPDxt5-L9o7eCa9D5Q_neQAD5WB';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);