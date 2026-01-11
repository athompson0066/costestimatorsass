
import { BusinessConfig, EstimationResult } from '../types.ts';

/**
 * Professional HTML template for the customer (user).
 * Includes branding colors and a clear summary of the AI estimate.
 */
export const generateUserEmailTemplate = (config: BusinessConfig, lead: any, estimate: EstimationResult) => {
  const brandColor = config.primaryColor || '#f97316';
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .header { background-color: ${brandColor}; padding: 40px 20px; text-align: center; color: white; }
        .content { padding: 40px; }
        .estimate-box { background-color: #f8fafc; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; border: 1px solid #f1f5f9; }
        .footer { padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; background: #f8fafc; }
        .btn { display: inline-block; padding: 12px 24px; background-color: ${brandColor}; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
        h1 { margin: 0; font-size: 24px; }
        .price { font-size: 32px; font-weight: 800; color: ${brandColor}; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Project Quote Estimate</h1>
          <p style="opacity: 0.9">${config.name} Assistant</p>
        </div>
        <div class="content">
          <p>Hi <strong>${lead.name}</strong>,</p>
          <p>Thank you for reaching out to <strong>${config.name}</strong>. Our AI assistant has analyzed your project requirements and generated an initial estimate for you.</p>
          
          <div class="estimate-box">
            <span style="text-transform: uppercase; font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 1px;">Initial Estimate Range</span>
            <div class="price">${estimate.estimatedCostRange}</div>
            <p style="margin: 0; color: #64748b; font-size: 14px;">Estimated duration: ${estimate.timeEstimate}</p>
          </div>

          <h3 style="color: #1e293b;">Next Steps</h3>
          <p>A member of our team has been notified. We will review your project details and contact you at <strong>${lead.phone}</strong> to finalize the scope and schedule a visit.</p>
          
          <p><strong>Requested Schedule:</strong><br>${lead.date || 'To be discussed'} at ${lead.time || 'TBD'}</p>

          <p style="margin-top: 40px; font-size: 14px;">Best regards,<br>The ${config.name} Team</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} ${config.name}. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Professional HTML template for the handyman company (client).
 * Focuses on lead data and conversion.
 */
export const generateClientEmailTemplate = (config: BusinessConfig, lead: any, estimate: EstimationResult) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.5; color: #1e293b; background-color: #f1f5f9; padding: 20px; }
        .card { background: white; max-width: 600px; margin: 0 auto; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden; }
        .banner { background: #1e293b; color: white; padding: 20px; }
        .section { padding: 30px; border-bottom: 1px solid #f1f5f9; }
        .label { font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
        .value { font-size: 16px; font-weight: 600; margin-bottom: 20px; }
        .tag { display: inline-block; background: #ffedd5; color: #9a3412; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="banner">
          <h2 style="margin:0">New Project Lead 🚀</h2>
        </div>
        <div class="section">
          <div class="label">Customer Details</div>
          <div class="value">${lead.name}</div>
          
          <div style="display: flex; gap: 20px;">
            <div style="flex: 1">
              <div class="label">Phone</div>
              <div class="value"><a href="tel:${lead.phone}" style="color: #2563eb; text-decoration: none;">${lead.phone}</a></div>
            </div>
            <div style="flex: 1">
              <div class="label">Email</div>
              <div class="value"><a href="mailto:${lead.email}" style="color: #2563eb; text-decoration: none;">${lead.email}</a></div>
            </div>
          </div>

          <div class="label">Project Notes</div>
          <div class="value" style="font-weight: 400; background: #f8fafc; padding: 15px; border-radius: 8px;">${lead.notes || 'No notes provided.'}</div>
        </div>

        <div class="section" style="background: #fafafa">
          <div class="label">AI Estimate Provided</div>
          <div style="font-size: 24px; font-weight: 800; color: #ea580c;">${estimate.estimatedCostRange}</div>
          <p style="font-size: 13px; color: #64748b;">${estimate.laborEstimate} labor + ${estimate.materialsEstimate} materials</p>
        </div>

        <div class="section">
          <div class="label">Requested Appointment</div>
          <div class="value">${lead.date || 'No date set'} at ${lead.time || 'No time set'}</div>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Sends an email using the Resend API.
 */
export const sendResendEmail = async (apiKey: string, to: string, subject: string, html: string, fromName?: string) => {
  if (!apiKey) return false;

  try {
    const from = fromName ? `${fromName} <onboarding@resend.dev>` : `HandyBot <onboarding@resend.dev>`;
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from,
        to: Array.isArray(to) ? to : [to],
        subject: subject,
        html: html,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      console.error('Resend API Error:', errData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Email Dispatch Failed:', error);
    return false;
  }
};
