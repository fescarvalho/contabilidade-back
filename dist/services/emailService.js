"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enviarEmailNovoDocumento = exports.enviarEmailRecuperacao = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Configuração do Transporter
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GOOGLE_EMAIL,
        pass: process.env.GOOGLE_API_KEY
    }
});
// Padronize o remetente aqui para não dar erro de permissão
const REMETENTE_PADRAO = `"Leandro Abreu Contabilidade" <${process.env.GOOGLE_EMAIL}>`;
const enviarEmailRecuperacao = async (destinatario, link) => {
    console.log(`📨 Enviando e-mail para: ${destinatario}`);
    const htmlContent = `
    <div style="font-family: Arial, color: #333;">
      <h2>Leandro Abreu Contabilidade</h2>
      <p>Clique abaixo para redefinir sua senha:</p>
      <a href="${link}" style="background: #C5A059; color: black; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
        Redefinir Senha
      </a>
    </div>
  `;
    try {
        await transporter.sendMail({
            from: REMETENTE_PADRAO, // Usa o e-mail do Gmail autenticado
            to: destinatario,
            subject: 'Redefinição de Senha',
            html: htmlContent,
        });
        console.log("✅ E-mail enviado com sucesso!");
        return true;
    }
    catch (error) {
        console.error("❌ Erro ao enviar:", error);
        return false;
    }
};
exports.enviarEmailRecuperacao = enviarEmailRecuperacao;
const enviarEmailNovoDocumento = async (emailDestino, nomeCliente, tituloDoc) => {
    try {
        const linkPlataforma = "https://leandro-abreu-contabilidade.vercel.app/usuario";
        const htmlContent = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Olá, ${nomeCliente}!</h2>
        <p>A equipe Leandro Abreu Contabilidade acabou de enviar um novo documento para você.</p>
        
        <div style="background: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <strong>📄 Documento:</strong> ${tituloDoc}<br>
          <strong>📅 Data:</strong> ${new Date().toLocaleDateString('pt-BR')}
        </div>

        <p>Acesse a plataforma para visualizar ou baixar:</p>
        <a href="${linkPlataforma}" style="background-color: #C5A059; color: black; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
          Acessar Painel
        </a>
      </div>
    `;
        await transporter.sendMail({
            from: REMETENTE_PADRAO, // Usa o mesmo remetente padronizado
            to: emailDestino,
            subject: `📄 Novo Documento: ${tituloDoc}`,
            html: htmlContent,
        });
        console.log(`✅ E-mail de documento enviado para ${emailDestino}`);
        return true;
    }
    catch (error) {
        console.error("❌ Erro ao enviar e-mail de documento:", error);
        return false;
    }
};
exports.enviarEmailNovoDocumento = enviarEmailNovoDocumento;
