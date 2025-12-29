-- Reset (Caution: Deletes existing data)
DROP TABLE IF EXISTS public.outreach_logs;

-- Create the outreach_logs table
CREATE TABLE public.outreach_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    reddit_username TEXT NOT NULL,

    -- Ensure a user doesn't double-log the same reddit user?
    -- Or maybe we want to allow re-messaging after some time?
    -- For now, let's keep it simple.
    CONSTRAINT unique_messaging_event UNIQUE (user_id, reddit_username)
);

-- Enable Row Level Security
ALTER TABLE public.outreach_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only insert logs where the user_id matches their own
CREATE POLICY "Users can insert their own logs"
ON public.outreach_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own logs
CREATE POLICY "Users can view their own logs"
ON public.outreach_logs
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Service Role (Backend) has full access (Implicit in Supabase, but good to know)
