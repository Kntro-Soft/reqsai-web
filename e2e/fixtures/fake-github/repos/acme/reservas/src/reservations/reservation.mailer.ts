import nodemailer from 'nodemailer';

const transport = nodemailer.createTransport({ host: 'smtp.example.com', auth: { user: 'app', pass: process.env.SMTP_PASS } });

export async function sendConfirmationEmail(reservation: { email: string; startsAt: string }) {
  await transport.sendMail({ to: reservation.email, subject: 'Tu reserva en La Tradición está confirmada' });
}
