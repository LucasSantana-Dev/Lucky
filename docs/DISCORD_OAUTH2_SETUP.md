# Discord OAuth2 Quick Setup Guide

## Step 1: Add Redirect URI

In the Discord Developer Portal OAuth2 page:

1. Find the **"Redirects"** section
2. Click in the empty input field
3. Add exactly: `http://localhost:3000/api/auth/callback`
4. Click **"Save Changes"** at the bottom of the page

**Important:** The redirect URI must match exactly what's in your `.env` file (`WEBAPP_REDIRECT_URI`).

## Step 2: Get Client Secret

1. In the **"Client Information"** section
2. Find **"Client Secret"**
3. Click **"Reset Secret"** if you don't have one, or click the copy button if it exists
4. Copy the secret value
5. Add it to your `.env` file as `CLIENT_SECRET=your_secret_here`

**Security Note:** Never commit the client secret to version control. Keep it in `.env` only.

## Step 3: Verify Scopes (Optional)

The application uses these OAuth2 scopes:

- `identify` - Get user information
- `guilds` - Get user's guilds

You don't need to configure these in the portal - they're automatically included in the OAuth request. The OAuth2 URL Generator section is for bot invites, not user authentication.

## Step 4: Test Configuration

After saving:

1. Ensure your backend server is running
2. Navigate to `http://localhost:5173`
3. Click "Login with Discord"
4. You should be redirected to Discord for authorization
5. After authorizing, you should be redirected back to the frontend

## Troubleshooting

### "Invalid redirect_uri" Error

- Verify the redirect URI in Discord portal matches exactly: `http://localhost:3000/api/auth/callback`
- Check that `WEBAPP_REDIRECT_URI` in `.env` matches
- Ensure there are no trailing slashes or extra characters

### "Invalid client secret" Error

- Verify `CLIENT_SECRET` is set in `.env`
- Ensure you copied the entire secret (it's long)
- Restart the backend server after updating `.env`

### CORS Errors

- Ensure `WEBAPP_FRONTEND_URL` in `.env` matches your frontend URL
- Check that CORS middleware is properly configured
