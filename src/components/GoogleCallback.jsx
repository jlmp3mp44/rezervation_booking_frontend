import React, { useEffect, useState } from 'react';

const GoogleCallback = () => {
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (!code || !state) {
        setError('Missing code or state in URL parameters.');
        return;
      }

      try {
        const redirect_uri = window.location.origin + '/auth/google';
        const response = await fetch('/api/auth/google', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            state,
            redirect_uri
          })
        });

        if (!response.ok) {
          throw new Error('Failed to exchange code for tokens');
        }

        const data = await response.json();

        if (data.access_token && data.refresh_token) {
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);

          if (data.user) {
            localStorage.setItem('user_email', data.user.email);
            localStorage.setItem('user_logged_in', 'true');
            localStorage.setItem('admin_logged_in', data.user.isAdmin ? 'true' : 'false');
          }

          // Redirect back to main page
          window.location.href = '/';
        } else {
          setError('Invalid response from server.');
        }

      } catch (err) {
        console.error('Error during Google auth callback:', err);
        setError(err.message || 'An error occurred during authentication.');
      }
    };

    handleCallback();
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      {error ? (
        <>
          <h2 style={{ color: 'var(--brand-red)' }}>Authentication Failed</h2>
          <p>{error}</p>
          <button onClick={() => window.location.href = '/'} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Go Back
          </button>
        </>
      ) : (
        <>
          <h2>Completing login...</h2>
          <p>Please wait while we log you in.</p>
        </>
      )}
    </div>
  );
};

export default GoogleCallback;
