"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enviarEmailNovoDocumento = exports.enviarEmailRecuperacao = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Configuração para usar o Gmail DE VERDADE
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GOOGLE_EMAIL,
        pass: process.env.GOOGLE_API_KEY
    }
});
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
            from: '"Leandro Abreu" <leandrocontabil2010@hotmail.com>', // Tem que ser igual ao user acima
            to: destinatario, // AGORA FUNCIONA PARA QUALQUER UM!
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
// Adicione essa nova função no final do arquivo, mantendo a de recuperação
const enviarEmailNovoDocumento = async (emailDestino, nomeCliente, tituloDoc) => {
    try {
        const linkPlataforma = "https://leandro-abreu-contabilidade.vercel.app/usuario"; // Link do Login
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
        
        <p style="font-size: 12px; color: #666; margin-top: 30px;">
          Não responda a este e-mail.
        </p>
      </div>
    `;
        // Aqui usamos a mesma configuração que você já tem no 'transporter'
        // Se você usa Resend, Nodemailer, etc, adapte a chamada abaixo:
        await transporter.sendMail({
            from: '"Leandro Abreu Contabilidade" <leandroabreucontabilidade@gmail.com>',
            to: emailDestino,
            subject: `📄 Novo Documento: ${tituloDoc}`,
            html: htmlContent,
        });
        console.log(`E-mail de documento enviado para ${emailDestino}`);
        return true;
    }
    catch (error) {
        console.error("Erro ao enviar e-mail de documento:", error);
        return false; // Não queremos travar o upload se o e-mail falhar, só logar o erro
    }
};
exports.enviarEmailNovoDocumento = enviarEmailNovoDocumento;
