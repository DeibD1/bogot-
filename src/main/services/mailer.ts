// Envío de correos. Dos proveedores posibles:
//  - Resend (RESEND_API_KEY / RESEND_FROM en el entorno): el usado en producción
//    (Vercel), vía su API HTTP — sin depender de SMTP de Microsoft, que está
//    retirando la autenticación básica.
//  - SMTP clásico (nodemailer): respaldo para uso local/Electron, configurado
//    en database.config.json (clave "smtp").
import nodemailer, { type Transporter } from 'nodemailer'
import type { ConfigApp } from '../db/path.js'

export interface Mailer {
  enviar: (para: string, asunto: string, texto: string) => Promise<void>
}

function crearMailerResend(): Mailer | null {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!apiKey || !from) return null

  return {
    enviar: async (para, asunto, texto) => {
      const respuesta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to: para, subject: asunto, text: texto })
      })
      if (!respuesta.ok) {
        const detalle = await respuesta.text().catch(() => '')
        throw new Error(`Resend respondió ${respuesta.status}: ${detalle}`)
      }
    }
  }
}

function crearMailerSmtp(config: ConfigApp): Mailer | null {
  const smtp = config.smtp
  if (!smtp?.host || !smtp.user || !smtp.pass) return null

  const transporte: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port ?? 587,
    secure: (smtp.port ?? 587) === 465, // 587 usa STARTTLS
    auth: { user: smtp.user, pass: smtp.pass }
  })

  return {
    enviar: async (para, asunto, texto) => {
      await transporte.sendMail({
        from: smtp.from ?? smtp.user,
        to: para,
        subject: asunto,
        text: texto
      })
    }
  }
}

/** Crea el mailer disponible: Resend si hay API key, si no SMTP, si no null. */
export function crearMailer(config: ConfigApp): Mailer | null {
  return crearMailerResend() ?? crearMailerSmtp(config)
}
