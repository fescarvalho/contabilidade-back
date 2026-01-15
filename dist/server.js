"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv")); // 1. O dotenv vem PRIMEIRO
dotenv_1.default.config(); // 2. Carrega as senhas IMEDIATAMENTE
// 3. Só agora importamos o resto
const express_1 = __importDefault(require("express"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const docs_routes_1 = __importDefault(require("./routes/docs.routes"));
const app = (0, express_1.default)();
app.use((req, res, next) => {
    // 1. Quem pode acessar (Seu Frontend)
    res.header("Access-Control-Allow-Origin", "https://leandro-abreu-contabilidade.vercel.app");
    // 2. Métodos permitidos
    res.header("Access-Control-Allow-Methods", "GET, PUT, POST, PATCH, DELETE, OPTIONS");
    // 3. Cabeçalhos permitidos
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    // 4. A MÁGICA: Se for o "Preflight" (OPTIONS), responde 200 OK na hora e encerra!
    if (req.method === 'OPTIONS') {
        res.status(200).send();
        return;
    }
    next(); // Se não for OPTIONS, segue para as rotas normais
});
app.use(express_1.default.json());
app.use(auth_routes_1.default);
app.use(docs_routes_1.default);
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`SERVIDOR RODANDO NA PORTA ${PORT} 🚀`);
});
