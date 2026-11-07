import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Dashboard from './Dashboard';
import Login from './Login';
import './App.css';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading-screen">Loading Nemintsco Depot...</div>;
  }

  return session ? <Dashboard session={session} /> : <Login />;
}