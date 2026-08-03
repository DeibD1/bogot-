// Envío de correos vía SMTP (Microsoft 365 / cualquier servidor de la empresa).
// La configuración llega de database.config.json (clave "smtp").
import nodemailer, { type Transporter } from 'nodemailer'
import type { ConfigApp } from '../db/path.js'

export interface Mailer {
  enviar: (para: string, asunto: string, texto: string) => Promise<void>
}

/** Crea el mailer si hay configuración SMTP; null si no la hay. */
export function crearMailer(config: ConfigApp): Mailer | null {
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
