import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();   

// Configuração para usar o Gmail DE VERDADE
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GOOGLE_EMAIL, 
    pass: process.env.GOOGLE_API_KEY   
  }
});

export const enviarEmailRecuperacao = async (destinatario: string, link: string) => {
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
  } catch (error) {
    console.error("❌ Erro ao enviar:", error);
    return false;
  }
};