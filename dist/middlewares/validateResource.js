"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const zod_1 = require("zod");
const validate = (schema) => (req, res, next) => {
    try {
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    }
    catch (e) {
        if (e instanceof zod_1.ZodError) {
            console.log("ERRO DE VALIDAÇÃO ZOD:", JSON.stringify(e, null, 2));
            return res.status(400).json({
                msg: "Dados inválidos",
                errors: e.issues.map((issue) => ({
                    campo: issue.path[1],
                    mensagem: issue.message,
                })),
            });
        }
        return res.status(400).json({ msg: "Erro inesperado na validação" });
    }
};
exports.validate = validate;
