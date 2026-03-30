console.log('JWT_SECRET present:', !!process.env.JWT_SECRET, '| length:', process.env.JWT_SECRET?.length ?? 0);
console.log('VITE_APP_ID:', process.env.VITE_APP_ID ?? '(empty)');
console.log('OAUTH_SERVER_URL:', process.env.OAUTH_SERVER_URL ?? '(empty)');
