const { createClient } = require('@supabase/supabase-js');

// Supabase credentials
const supabaseUrl = 'https://jpvulcfylxjodzpxexqu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwdnVsY2Z5bHhqb2R6cHhleHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NjYxNDAsImV4cCI6MjA2MzM0MjE0MH0.uH33fxn9pmEq3p4qgf52CAfFqBhxPF18obdOOHeujlY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabase() {
  try {
    // Test: Insert a user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({ telegram_id: '123456789' })
      .select();

    if (userError) {
      console.error('Error inserting user:', userError);
      return;
    }
    console.log('User inserted:', user);

    // Test: Insert a tracked account
    const { data: trackedAccount, error: trackedError } = await supabase
      .from('tracked_accounts')
      .insert({ user_id: user[0].id, instagram_username: 'test_user' })
      .select();

    if (trackedError) {
      console.error('Error inserting tracked account:', trackedError);
      return;
    }
    console.log('Tracked account inserted:', trackedAccount);

    // Test: Insert a story log
    const { data: storyLog, error: storyError } = await supabase
      .from('story_logs')
      .insert({ user_id: user[0].id, instagram_username: 'test_user', file_name: 'test_story.mp4' })
      .select();

    if (storyError) {
      console.error('Error inserting story log:', storyError);
      return;
    }
    console.log('Story log inserted:', storyLog);

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

testSupabase();
