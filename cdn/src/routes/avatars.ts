import { Router, Response, Request } from "express";
import { Config, Snowflake } from "@fosscord/util";
import { storage } from "@fosscord/cdn/util/Storage";
import FileType from "file-type";
import { HTTPError } from "lambert-server";
import { multer } from "@fosscord/cdn/util/multer";
import crypto from "crypto";

// TODO: check premium and animated pfp are allowed in the config
// TODO: generate different sizes of icon
// TODO: generate different image types of icon
// TODO: delete old icons

const ANIMATED_MIME_TYPES = ["image/apng", "image/gif", "image/gifv"];
const STATIC_MIME_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/svg+xml",
	"image/svg",
];
const ALLOWED_MIME_TYPES = [...ANIMATED_MIME_TYPES, ...STATIC_MIME_TYPES];

const router = Router();

router.post(
	"/:user_id",
	multer.single("file"),
	async (req: Request, res: Response) => {
		if (req.headers.signature !== Config.get().security.requestSignature)
			throw new HTTPError("Invalid request signature");
		if (!req.file) throw new HTTPError("Missing file");
		const { buffer, mimetype, size, originalname, fieldname } = req.file;
		const { user_id } = req.params;

		var hash = crypto
			.createHash("md5")
			.update(Snowflake.generate())
			.digest("hex");

		const type = await FileType.fromBuffer(buffer);
		if (!type || !ALLOWED_MIME_TYPES.includes(type.mime))
			throw new HTTPError("Invalid file type");
		if (ANIMATED_MIME_TYPES.includes(type.mime)) hash = `a_${hash}`; // animated icons have a_ infront of the hash

		const path = `avatars/${user_id}/${hash}`;
		const endpoint = Config.get().cdn.endpoint || "http://localhost:3003";

		await storage.set(path, buffer);

		return res.json({
			id: hash,
			content_type: type.mime,
			size,
			url: `${endpoint}${req.baseUrl}/${user_id}/${hash}`,
		});
	}
);

router.get("/:user_id/:hash", async (req: Request, res: Response) => {
	var { user_id, hash } = req.params;
	hash = hash.split(".")[0]; // remove .file extension
	const path = `avatars/${user_id}/${hash}`;

	const file = await storage.get(path);
	if (!file) throw new HTTPError("not found", 404);
	const type = await FileType.fromBuffer(file);

	res.set("Content-Type", type?.mime);
	res.set("Cache-Control", "public, max-age=31536000");

	return res.send(file);
});

router.delete("/:user_id/:id", async (req: Request, res: Response) => {
	if (req.headers.signature !== Config.get().security.requestSignature)
		throw new HTTPError("Invalid request signature");
	const { user_id, id } = req.params;
	const path = `avatars/${user_id}/${id}`;

	await storage.delete(path);

	return res.send({ success: true });
});

export default router;
