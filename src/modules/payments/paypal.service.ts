/*
 * ©Vidoos Mahin LTD's products Developed by Tanvir
 */
import { env } from '../../config/env';

// Sandbox vs Live URL logic
const PAYPAL_API = env.PAYPAL_MODE === 'live' 
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com';

async function getAccessToken() {
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  
  const data = await response.json();
  
  if (!data.access_token) {
    console.error('❌ PayPal Auth Failed. Check Client ID/Secret in .env');
    console.error('Response:', data);
    throw new Error('Failed to retrieve PayPal Access Token');
  }

  return data.access_token;
}

export const createSubscription = async (planId: string) => {
  try {
    const accessToken = await getAccessToken();

    // Debug Logs: To check what is actually being sent
    console.log(`🔍 [Debug] Initiating Subscription Creation...`);
    console.log(`👉 PayPal Mode: ${env.PAYPAL_MODE}`);
    console.log(`👉 Target Plan ID: ${planId}`);

    const response = await fetch(`${PAYPAL_API}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id: planId,
        application_context: {
          return_url: `${env.FRONTEND_URL}/payment/success`,
          cancel_url: `${env.FRONTEND_URL}/payment/cancel`,
          user_action: 'SUBSCRIBE_NOW' // Forces the 'Pay Now' flow immediately
        }
      }),
    });

    const data = await response.json();

    // If PayPal returns an error (like 400 or 404), log detailed info
    if (!response.ok) {
      console.error('❌ PayPal API Error Response:', JSON.stringify(data, null, 2));
      throw new Error(data.message || 'PayPal Subscription Failed');
    }

    return data;

  } catch (error) {
    // Re-throw to be caught by the controller
    throw error;
  }
};