"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enviarEmailNovoDocumento = exports.enviarEmailRecuperacao = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Configuração do Gmail
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GOOGLE_EMAIL,
        pass: process.env.GOOGLE_API_KEY
    }
});
const REMETENTE_OFICIAL = `"Leandro Abreu Contabilidade" <${process.env.GOOGLE_EMAIL}>`;
// --- TEMPLATE DE EMAIL MODERNO ---
const gerarHtmlTemplate = (titulo, corpo, link, textoBotao) => {
    // Logos configuradas (Links diretos do Drive)
    const urlImagemLogo = "https://drive.google.com/uc?export=view&id=1bYIqqeD5_B6vvRmi-2qo9tkKFgU9GPt0";
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${titulo}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding: 40px 10px;">
            
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              
              <tr>
                <td bgcolor="#111111" style="padding: 25px 20px; text-align: center;">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="display: inline-block; vertical-align: middle;">
                    <tr>
                      <td style="padding-right: 15px; vertical-align: middle;">
                        <img src="${urlImagemLogo}" alt="Logo" width="55" height="55" style="display: block; border: 0; object-fit: contain;">
                      </td>
                      <td style="vertical-align: middle; text-align: left; border-left: 1px solid #333; padding-left: 15px;">
                        <h1 style="color: #C5A059; margin: 0; font-size: 20px; font-weight: 300; letter-spacing: 1px; font-family: serif; line-height: 1.2;">
                          LEANDRO ABREU
                        </h1>
                        <p style="color: #888; margin: 2px 0 0 0; font-size: 9px; text-transform: uppercase; letter-spacing: 3px;">
                          CONTABILIDADE
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding: 40px 30px;">
                  ${corpo}
                  
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td align="center" style="padding-top: 30px;">
                        <a href="${link}" target="_blank" style="display: inline-block; padding: 16px 36px; font-family: sans-serif; font-size: 16px; font-weight: bold; color: #000000; background-color: #C5A059; text-decoration: none; border-radius: 6px; transition: background-color 0.3s;">
                          ${textoBotao}
                        </a>
                      </td>
                    </tr>
                  </table>

                </td>
              </tr>

              <tr>
                <td bgcolor="#f9f9f9" style="padding: 30px 20px; text-align: center; border-top: 1px solid #eeeeee;">
                  <p style="margin: 0; font-size: 12px; color: #999999; line-height: 1.5;">
                    &copy; ${new Date().getFullYear()} Leandro Abreu Contabilidade.<br>
                    Rua Dr. Raul Travassos, nº 03, Loja 02 - Natividade/RJ<br>
                    CNPJ: 34.117.554/0001-95<br>
                    Esta é uma mensagem automática, por favor não responda.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>

    </body>
    </html>
  `;
};
// --- 1. RECUPERAÇÃO DE SENHA ---
const enviarEmailRecuperacao = async (destinatario, link) => {
    console.log(`📨 Enviando recuperação para: ${destinatario}`);
    const corpoMensagem = `
    <h2 style="color: #333; font-size: 22px; margin-top: 0;">Recuperação de Senha</h2>
    <p style="color: #555; font-size: 16px; line-height: 1.6;">
      Recebemos uma solicitação para redefinir a senha da sua conta. Se foi você, clique no botão abaixo para criar uma nova senha.
    </p>
    <p style="color: #999; font-size: 14px; margin-top: 20px;">
      Se não foi você, pode ignorar este e-mail com segurança.
    </p>
  `;
    const htmlFinal = gerarHtmlTemplate("Redefinir Senha", corpoMensagem, link, "REDEFINIR MINHA SENHA");
    try {
        await transporter.sendMail({
            from: REMETENTE_OFICIAL,
            to: destinatario,
            subject: 'Redefinição de Senha',
            html: htmlFinal,
        });
        console.log("✅ Recuperação enviada!");
        return true;
    }
    catch (error) {
        console.error("❌ Erro ao enviar recuperação:", error);
        return false;
    }
};
exports.enviarEmailRecuperacao = enviarEmailRecuperacao;
// --- 2. NOVO DOCUMENTO ---
const enviarEmailNovoDocumento = async (emailDestino, nomeCliente, tituloDoc) => {
    console.log(`📨 Enviando aviso de documento para: ${emailDestino}`);
    // ✅ ATUALIZADO: Agora aponta direto para a tela de LOGIN
    const linkPlataforma = "https://leandro-abreu-contabilidade.vercel.app/login";
    const corpoMensagem = `
    <h2 style="color: #333; font-size: 20px; margin-top: 0;">Olá, ${nomeCliente}!</h2>
    <p style="color: #555; font-size: 16px; line-height: 1.6;">
      Um novo documento importante foi adicionado à sua área segura.
    </p>
    
    <div style="background-color: #fff8e1; border-left: 4px solid #C5A059; padding: 15px 20px; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0; color: #8a6d3b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Documento Disponível</p>
      <p style="margin: 5px 0 0 0; color: #333; font-size: 18px; font-weight: 600;">
        📄 ${tituloDoc}
      </p>
      <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">
        📅 Enviado em: ${new Date().toLocaleDateString('pt-BR')}
      </p>
    </div>

    <p style="color: #555; font-size: 16px;">
      Acesse a plataforma agora para visualizar ou realizar o download.
    </p>
  `;
    const htmlFinal = gerarHtmlTemplate(`Novo Documento: ${tituloDoc}`, corpoMensagem, linkPlataforma, "ACESSAR MEUS DOCUMENTOS");
    try {
        await transporter.sendMail({
            from: REMETENTE_OFICIAL,
            to: emailDestino,
            subject: `📄 Novo Documento: ${tituloDoc}`,
            html: htmlFinal,
        });
        console.log(`✅ Aviso de documento enviado para ${emailDestino}`);
        return true;
    }
    catch (error) {
        console.error("❌ Erro ao enviar aviso de documento:", error);
        return false;
    }
};
exports.enviarEmailNovoDocumento = enviarEmailNovoDocumento;
