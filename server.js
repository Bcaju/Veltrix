require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_PATH = (process.env.ADMIN_PATH || "").replace(/\/+$/, "");

if (!ADMIN_PATH.startsWith("/") || ADMIN_PATH.length < 10) {
  throw new Error("ADMIN_PATH is missing or invalid.");
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters.");
}

if (!ADMIN_PASSWORD || !MONGODB_URI) {
  throw new Error("ADMIN_PASSWORD or MONGODB_URI is missing from .env");
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "16mb" }));
app.use(cookieParser());

// Зөвхөн вебсайтад шаардлагатай файлуудыг нээнэ.
const path = require("path");
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/index.html", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
// Нууц админ самбарын зам
app.get(ADMIN_PATH, (req, res) => {
  if (req.path === ADMIN_PATH) {
    return res.redirect(308, `${ADMIN_PATH}/`);
  }
  return res.sendFile(path.join(__dirname, "admin.html"));
});
app.get(`${ADMIN_PATH}/admin.css`, (req, res) => res.sendFile(path.join(__dirname, "admin.css")));
app.get(`${ADMIN_PATH}/admin.js`, (req, res) => res.sendFile(path.join(__dirname, "admin.js")));
app.get("/style.css", (req, res) => res.sendFile(path.join(__dirname, "style.css")));
app.get("/script.js", (req, res) => res.sendFile(path.join(__dirname, "script.js")));
app.get("/logo.svg", (req, res) => res.sendFile(path.join(__dirname, "logo.svg")));
app.get("/phoenix-logo.svg", (req, res) => res.sendFile(path.join(__dirname, "phoenix-logo.svg")));
app.get("/veltrix-favicon.png", (req, res) => res.sendFile(path.join(__dirname, "veltrix-favicon.png")));
app.get("/veltrix-favicon.ico", (req, res) => res.sendFile(path.join(__dirname, "veltrix-favicon.ico")));


const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Хэт олон удаа оролдлоо. Дараа дахин оролдоно уу." }
});

const repairSchema = new mongoose.Schema({
  repairNumber: { type: String, unique: true, index: true },
  customerName: { type: String, trim: true, default: "" },
  phone: { type: String, trim: true, default: "" },
  bicycleType: { type: String, trim: true, default: "" },
  brand: { type: String, trim: true, default: "" },
  model: { type: String, trim: true, default: "" },
  issue: { type: String, trim: true, default: "" },
  photos: { type: [String], default: [] },
  partsUsed: { type: String, default: "" },
  mechanic: { type: String, default: "" },
  laborCost: { type: Number, min: 0, default: 0 },
  partsCost: { type: Number, min: 0, default: 0 },
  total: { type: Number, min: 0, default: 0 },
  status: {
    type: String,
    enum: ["Хүлээн авсан", "Засварт байгаа", "Бэлэн болсон", "Хүлээлгэн өгсөн", "Цуцалсан"],
    default: "Хүлээн авсан"
  },
  paymentStatus: {
    type: String,
    enum: ["Төлөөгүй", "Хэсэгчлэн төлсөн", "Төлсөн"],
    default: "Төлөөгүй"
  },
  notes: { type: String, default: "" }
}, { timestamps: true });

const Repair = mongoose.model("Repair", repairSchema);

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  cost: { type: Number, required: true, min: 0, default: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  image: { type: String, trim: true, default: "" },
  description: { type: String, trim: true, maxlength: 1000, default: "" }
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  orderNumber: { type: String, required: true, unique: true },
  customerName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  deliveryType: { type: String, enum: ["delivery", "pickup"], required: true },
  address: { type: String, trim: true, default: "" },
  paymentMethod: { type: String, enum: ["cash", "transfer"], required: true },
  note: { type: String, trim: true, maxlength: 500, default: "" },
  items: [{
    productId: String,
    name: String,
    price: Number,
    cost: { type: Number, default: 0 },
    quantity: Number
  }],
  total: { type: Number, required: true, min: 0 },
  stockDeducted: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["Шинэ", "Баталгаажсан", "Бэлтгэж байна", "Хүргэлтэд гарсан", "Дууссан", "Цуцалсан"],
    default: "Шинэ"
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ["Шинэ", "Баталгаажсан", "Бэлтгэж байна", "Хүргэлтэд гарсан", "Дууссан", "Цуцалсан"],
      required: true
    },
    changedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const Order = mongoose.model("Order", orderSchema);

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  phone: { type: String, required: true, unique: true, index: true },
  profileImage: { type: String, trim: true, default: "" },
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const chatMessageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  sender: {
    type: String,
    enum: ["user", "admin"],
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  read: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

chatMessageSchema.index({ userId: 1, createdAt: 1 });

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);





function requireAdmin(req, res, next) {
  const token = req.cookies.veltrix_admin;

  if (!token) {
    return res.status(401).json({ error: "Нэвтрэх шаардлагатай." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Зөвшөөрөлгүй." });
    }
    next();
  } catch {
    return res.status(401).json({ error: "Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү." });
  }
}


function requireUser(req, res, next) {
  const token = req.cookies.veltrix_user;

  if (!token) {
    return res.status(401).json({ error: "Хэрэглэгчээр нэвтэрнэ үү." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "user" || !decoded.userId) {
      return res.status(403).json({ error: "Зөвшөөрөлгүй." });
    }
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү." });
  }
}


// ===== PHOENIX LIVE CHAT API =====

// Хэрэглэгч өөрийн мессежүүдийг авах
app.get("/api/chat/messages", requireUser, async (req, res) => {
  try {
    const messages = await ChatMessage.find({
      userId: req.userId
    }).sort({ createdAt: 1 }).limit(200).lean();

    await ChatMessage.updateMany(
      { userId: req.userId, sender: "admin", read: false },
      { $set: { read: true } }
    );

    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: "Чат ачааллахад алдаа гарлаа." });
  }
});

// Хэрэглэгч мессеж илгээх
app.post("/api/chat/messages", requireUser, async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message || message.length > 1000) {
      return res.status(400).json({
        error: "Мессеж 1-1000 тэмдэгт байх ёстой."
      });
    }

    const saved = await ChatMessage.create({
      userId: req.userId,
      sender: "user",
      message
    });

    res.status(201).json({ message: saved });
  } catch (error) {
    res.status(500).json({ error: "Мессеж илгээж чадсангүй." });
  }
});

// Админ бүх харилцан яриаг харах
app.get("/api/admin/chats", requireAdmin, async (req, res) => {
  try {
    const chats = await ChatMessage.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$userId",
          lastMessage: { $first: "$$ROOT" },
          unread: {
            $sum: {
              $cond: [
                { $and: [
                  { $eq: ["$sender", "user"] },
                  { $eq: ["$read", false] }
                ]},
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { "lastMessage.createdAt": -1 } },
      { $limit: 100 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          userName: "$user.name",
          phone: "$user.phone",
          lastMessageId: "$lastMessage._id",
          lastMessage: "$lastMessage.message",
          lastAt: "$lastMessage.createdAt",
          lastSender: "$lastMessage.sender",
          unread: 1
        }
      }
    ]);

    res.json({ chats });
  } catch (error) {
    res.status(500).json({ error: "Чатуудыг ачаалж чадсангүй." });
  }
});

// Админ сонгосон хэрэглэгчийн чатыг харах
app.get("/api/admin/chats/:userId/messages", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Хэрэглэгчийн ID буруу байна." });
    }

    const messages = await ChatMessage.find({
      userId
    }).sort({ createdAt: 1 }).limit(200).lean();

    await ChatMessage.updateMany(
      { userId, sender: "user", read: false },
      { $set: { read: true } }
    );

    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: "Мессежүүдийг ачаалж чадсангүй." });
  }
});

// Админ хэрэглэгчид хариу илгээх
app.post("/api/admin/chats/:userId/messages", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const message = String(req.body?.message || "").trim();

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Хэрэглэгчийн ID буруу байна." });
    }

    if (!message || message.length > 1000) {
      return res.status(400).json({
        error: "Мессеж 1-1000 тэмдэгт байх ёстой."
      });
    }

    const saved = await ChatMessage.create({
      userId,
      sender: "admin",
      message
    });

    res.status(201).json({ message: saved });
  } catch (error) {
    res.status(500).json({ error: "Хариу илгээж чадсангүй." });
  }
});

// ===== LIVE CHAT API END =====

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});


// ===== ХЭРЭГЛЭГЧИЙН БҮРТГЭЛ, НЭВТРЭЛТ =====
app.post("/api/auth/register", loginLimiter, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").replace(/\D/g, "");
    const password = req.body?.password;

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ error: "Нэрээ зөв оруулна уу." });
    }
    if (phone.length < 8 || phone.length > 15) {
      return res.status(400).json({ error: "Утасны дугаараа зөв оруулна уу." });
    }
    if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ error: "Нууц үг 8-72 байт байх ёстой." });
    }

    if (await User.findOne({ phone })) {
      return res.status(409).json({ error: "Энэ утасны дугаар бүртгэлтэй байна." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, phone, passwordHash });

    const token = jwt.sign(
      { role: "user", userId: String(user._id) },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("veltrix_user", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/"
    });

    res.status(201).json({
      ok: true,
      user: { name: user.name, phone: user.phone }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Энэ утасны дугаар бүртгэлтэй байна." });
    }
    console.error("Register error:", error);
    res.status(500).json({ error: "Бүртгэл үүсгэхэд алдаа гарлаа." });
  }
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  try {
    const phone = String(req.body?.phone || "").replace(/\D/g, "");
    const password = req.body?.password;

    if (phone.length < 8 || phone.length > 15 || typeof password !== "string") {
      return res.status(400).json({ error: "Утас болон нууц үгээ зөв оруулна уу." });
    }

    const user = await User.findOne({ phone }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Утасны дугаар эсвэл нууц үг буруу байна." });
    }

    const token = jwt.sign(
      { role: "user", userId: String(user._id) },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("veltrix_user", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/"
    });

    res.json({ ok: true, user: { name: user.name, phone: user.phone } });
  } catch (error) {
    console.error("User login error:", error);
    res.status(500).json({ error: "Нэвтрэхэд алдаа гарлаа." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("veltrix_user", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/"
  });
  res.json({ ok: true });
});

app.get("/api/auth/me", requireUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("name phone profileImage").lean();
    if (!user) return res.status(401).json({ error: "Хэрэглэгч олдсонгүй." });
    res.set("Cache-Control", "no-store");
    res.json({ authenticated: true, user });
  } catch {
    res.status(500).json({ error: "Хэрэглэгчийн мэдээлэл авахад алдаа гарлаа." });
  }
});

app.get("/api/account/orders", requireUser, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.userId })
      .select("orderNumber customerName phone items total status statusHistory deliveryType createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    res.set("Cache-Control", "no-store");
    res.json({ ok: true, orders });
  } catch (error) {
    console.error("Account orders error:", error);
    res.status(500).json({ error: "Захиалгууд авахад алдаа гарлаа." });
  }
});

app.patch("/api/account/profile", requireUser, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").replace(/[^0-9]/g, "");

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ error: "Нэрээ зөв оруулна уу." });
    }

    if (phone.length < 8 || phone.length > 15) {
      return res.status(400).json({ error: "Утасны дугаараа зөв оруулна уу." });
    }

    const existingUser = await User.findOne({
      phone,
      _id: { $ne: req.userId }
    });

    if (existingUser) {
      return res.status(409).json({ error: "Энэ утасны дугаар өөр хэрэглэгчид бүртгэлтэй байна." });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { name, phone } },
      { new: true, runValidators: true }
    ).select("name phone");

    if (!user) {
      return res.status(404).json({ error: "Хэрэглэгч олдсонгүй." });
    }

    await Order.updateMany(
      { userId: req.userId },
      { $set: { phone } }
    );

    res.set("Cache-Control", "no-store");
    res.json({ ok: true, user, message: "Мэдээлэл амжилттай шинэчлэгдлээ." });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Мэдээлэл шинэчлэхэд алдаа гарлаа." });
  }
});

app.patch("/api/account/photo", requireUser, async (req, res) => {
  try {
    const profileImage = String(req.body?.profileImage || "");

    if (!profileImage) {
      return res.status(400).json({ error: "Зураг сонгоно уу." });
    }

    const match = profileImage.match(
      /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/
    );

    if (!match) {
      return res.status(400).json({ error: "JPEG, PNG эсвэл WEBP зураг сонгоно уу." });
    }

    const imageBuffer = Buffer.from(match[2], "base64");

    if (imageBuffer.length > 700 * 1024) {
      return res.status(400).json({ error: "Зургийн хэмжээ 700KB-аас бага байх ёстой." });
    }

    const signatures = {
      jpeg: imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8,
      png: imageBuffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      ),
      webp: imageBuffer.toString("ascii", 0, 4) === "RIFF" &&
            imageBuffer.toString("ascii", 8, 12) === "WEBP"
    };

    if (!signatures[match[1]]) {
      return res.status(400).json({ error: "Зургийн файл буруу байна." });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { profileImage } },
      { new: true, runValidators: true }
    ).select("name phone profileImage");

    if (!user) {
      return res.status(404).json({ error: "Хэрэглэгч олдсонгүй." });
    }

    res.set("Cache-Control", "no-store");
    res.json({ ok: true, user, message: "Профайл зураг шинэчлэгдлээ." });
  } catch (error) {
    console.error("Update profile photo error:", error);
    res.status(500).json({ error: "Профайл зураг шинэчлэхэд алдаа гарлаа." });
  }
});

app.patch("/api/account/password", requireUser, async (req, res) => {
  try {
    const currentPassword = req.body?.currentPassword;
    const newPassword = req.body?.newPassword;

    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ error: "Нууц үгийн мэдээллээ оруулна уу." });
    }

    if (newPassword.length < 8 || Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({ error: "Шинэ нууц үг 8-72 байт байх ёстой." });
    }

    const user = await User.findById(req.userId).select("+passwordHash");
    if (!user) {
      return res.status(404).json({ error: "Хэрэглэгч олдсонгүй." });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Одоогийн нууц үг буруу байна." });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ ok: true, message: "Нууц үг амжилттай солигдлоо." });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Нууц үг солиход алдаа гарлаа." });
  }
});

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  try {
    const password = req.body?.password;

    if (typeof password !== "string" || password.length === 0) {
      return res.status(400).json({ error: "Нууц үгээ оруулна уу." });
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const valid = await bcrypt.compare(password, passwordHash);

    if (!valid) {
      return res.status(401).json({ error: "Нууц үг буруу байна." });
    }

    const token = jwt.sign(
      { role: "admin" },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.cookie("veltrix_admin", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/"
    });

    res.json({ ok: true, message: "Амжилттай нэвтэрлээ." });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Серверийн алдаа." });
  }
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("veltrix_admin", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/"
  });
  res.json({ ok: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ authenticated: true, role: "admin" });
});

// Бараанууд
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find()
      .select("name category price stock image description")
      .sort({ createdAt: -1 })
      .lean();

    res.set("Cache-Control", "no-store");
    res.json(products);
  } catch (error) {
    console.error("Public products error:", error);
    res.status(500).json({ error: "Бараануудыг авахад алдаа гарлаа." });
  }
});


// Хэрэглэгч захиалга үүсгэх
app.post("/api/orders", requireUser, async (req, res) => {
  try {
    const data = req.body || {};
    const customerName = String(data.customerName || "").trim();
    const phone = String(data.phone || "").trim();
    const deliveryType = data.deliveryType;
    const address = String(data.address || "").trim();
    const paymentMethod = data.paymentMethod;
    const note = String(data.note || "").trim();
    const requestedItems = data.items;

    if (customerName.length < 2 || customerName.length > 100) {
      return res.status(400).json({ error: "Нэрээ зөв оруулна уу." });
    }
    if (!/^[0-9+()\-\s]{8,20}$/.test(phone)) {
      return res.status(400).json({ error: "Утасны дугаараа зөв оруулна уу." });
    }
    if (!["delivery", "pickup"].includes(deliveryType)) {
      return res.status(400).json({ error: "Авах төрлөө сонгоно уу." });
    }
    if (deliveryType === "delivery" && address.length < 5) {
      return res.status(400).json({ error: "Хүргэлтийн хаягаа оруулна уу." });
    }
    if (!["cash", "transfer"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Төлбөрийн хэлбэрээ сонгоно уу." });
    }
    if (note.length > 500) {
      return res.status(400).json({ error: "Нэмэлт тэмдэглэл хэт урт байна." });
    }
    if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 30) {
      return res.status(400).json({ error: "Сагс хоосон эсвэл барааны тоо хэтэрсэн байна." });
    }

    const quantities = new Map();
    for (const item of requestedItems) {
      const id = String(item.productId || "");
      const quantity = Number(item.quantity);
      if (!mongoose.isValidObjectId(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ error: "Барааны мэдээлэл буруу байна." });
      }
      quantities.set(id, (quantities.get(id) || 0) + quantity);
    }

    const products = await Product.find({
      _id: { $in: [...quantities.keys()] }
    }).lean();

    if (products.length !== quantities.size) {
      return res.status(400).json({ error: "Зарим бараа олдсонгүй. Сагсаа шинэчилнэ үү." });
    }

    const orderItems = [];
    let total = 0;

    for (const product of products) {
      const quantity = quantities.get(String(product._id));
      if (product.stock < quantity) {
        return res.status(400).json({ error: `${product.name}: үлдэгдэл хүрэлцэхгүй байна.` });
      }
      orderItems.push({
        productId: String(product._id),
        name: product.name,
        price: product.price,
        cost: Number(product.cost || 0),
        quantity
      });
      total += product.price * quantity;
    }

    const order = await Order.create({
      userId: req.userId,
      orderNumber: "VX-" + Date.now().toString(36).toUpperCase(),
      customerName,
      phone,
      deliveryType,
      address: deliveryType === "delivery" ? address : "",
      paymentMethod,
      note,
      items: orderItems,
      total,
      statusHistory: [{ status: "Шинэ" }]
    });

    res.status(201).json({
      ok: true,
      orderNumber: order.orderNumber,
      total: order.total,
      message: "Захиалга амжилттай бүртгэгдлээ."
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ error: "Захиалга бүртгэхэд алдаа гарлаа." });
  }
});



// Хэрэглэгч захиалгаа дугаар болон утсаар хянах
app.post("/api/orders/track", requireUser, async (req, res) => {
  try {
    const orderNumber = String(req.body?.orderNumber || "").trim().toUpperCase();
    const phone = String(req.body?.phone || "").replace(/\D/g, "");

    if (!/^VX-[A-Z0-9]+$/.test(orderNumber) || phone.length < 8 || phone.length > 15) {
      return res.status(400).json({ error: "Захиалгын дугаар болон утсаа зөв оруулна уу." });
    }

    const order = await Order.findOne({
      orderNumber,
      userId: req.userId
    }).select("orderNumber phone status createdAt items.name items.quantity total deliveryType")
      .lean();

    if (!order || String(order.phone).replace(/\D/g, "") !== phone) {
      return res.status(404).json({
        error: "Захиалга олдсонгүй. Мэдээллээ шалгаад дахин оролдоно уу."
      });
    }

    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        items: order.items.map(item => ({
          name: item.name,
          quantity: item.quantity
        })),
        total: order.total,
        deliveryType: order.deliveryType
      }
    });
  } catch (error) {
    console.error("Track order error:", error);
    res.status(500).json({ error: "Захиалга шалгахад алдаа гарлаа." });
  }
});

// Админ борлуулалтын статистик
app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .select("status total items createdAt")
      .lean();

    const completed = orders.filter(order => order.status === "Дууссан");
    const cancelled = orders.filter(order => order.status === "Цуцалсан");
    const active = orders.filter(order =>
      !["Дууссан", "Цуцалсан"].includes(order.status)
    );

    const totalRevenue = completed.reduce(
      (sum, order) => sum + Number(order.total || 0), 0
    );

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ulaanbaatar",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    const todayParts = formatter.format(new Date()).split("-").map(Number);
    const dailyMap = new Map();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.UTC(
        todayParts[0], todayParts[1] - 1, todayParts[2] - i
      ));
      const key = date.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, revenue: 0, orders: 0 });
    }

    const productMap = new Map();

    for (const order of completed) {
      if (order.createdAt) {
        const key = formatter.format(new Date(order.createdAt));
        const day = dailyMap.get(key);

        if (day) {
          day.revenue += Number(order.total || 0);
          day.orders += 1;
        }
      }

      for (const item of order.items || []) {
        const name = String(item.name || "Тодорхойгүй бараа");
        const quantity = Number(item.quantity || 0);
        const current = productMap.get(name) || {
          name, quantity: 0, revenue: 0
        };

        current.quantity += quantity;
        current.revenue += Number(item.price || 0) * quantity;
        productMap.set(name, current);
      }
    }

    const topProducts = [...productMap.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    res.set("Cache-Control", "no-store");
    res.json({
      totalOrders: orders.length,
      completedOrders: completed.length,
      activeOrders: active.length,
      newOrders: orders.filter(order => order.status === "Шинэ").length,
      cancelledOrders: cancelled.length,
      totalRevenue,
      dailySales: [...dailyMap.values()],
      topProducts
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    res.status(500).json({ error: "Статистик авахад алдаа гарлаа." });
  }
});


// Админ захиалгууд харах
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .lean();

    res.set("Cache-Control", "no-store");
    res.json(orders);
  } catch (error) {
    console.error("Admin orders error:", error);
    res.status(500).json({ error: "Захиалгуудыг авахад алдаа гарлаа." });
  }
});


// Админ захиалгын төлөв өөрчлөх
app.patch("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
  const allowed = [
    "Баталгаажсан",
    "Бэлтгэж байна",
    "Хүргэлтэд гарсан",
    "Дууссан",
    "Цуцалсан"
  ];

  const status = req.body?.status;

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Төлөв буруу байна." });
  }

  const session = await mongoose.startSession();
  let updatedOrder;

  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(req.params.id).session(session);

      if (!order) {
        const error = new Error("Захиалга олдсонгүй.");
        error.statusCode = 404;
        throw error;
      }

      // Баталгаажуулах үед үлдэгдэл хасах
      if (status === "Баталгаажсан" && !order.stockDeducted) {
        for (const item of order.items) {
          const product = await Product.findOneAndUpdate(
            {
              _id: item.productId,
              stock: { $gte: item.quantity }
            },
            {
              $inc: { stock: -item.quantity }
            },
            {
              new: true,
              session
            }
          );

          if (!product) {
            const error = new Error(
              `${item.name}: үлдэгдэл хүрэлцэхгүй байна.`
            );
            error.statusCode = 409;
            throw error;
          }
        }

        order.stockDeducted = true;
      }

      // Цуцлах үед хассан үлдэгдлийг буцаах
      if (status === "Цуцалсан" && order.stockDeducted) {
        for (const item of order.items) {
          const product = await Product.findByIdAndUpdate(
            item.productId,
            { $inc: { stock: item.quantity } },
            { new: true, session }
          );

          if (!product) {
            throw new Error(`${item.name}: бараа олдсонгүй.`);
          }
        }

        order.stockDeducted = false;
      }

      // Өмнөх төлөвийг хадгалах
      const previousStatus = order.status || "Шинэ";

      // Хуучин захиалгад түүх байхгүй бол эхний төлөвийг нөхөж бүртгэх
      if (!order.statusHistory || order.statusHistory.length === 0) {
        order.statusHistory = [{
          status: previousStatus,
          changedAt: order.createdAt || new Date()
        }];
      }

      // Зөвхөн төлөв өөрчлөгдсөн үед шинэ түүх нэмэх
      if (previousStatus !== status) {
        order.statusHistory.push({
          status,
          changedAt: new Date()
        });
      }

      order.status = status;
      await order.save({ session });
      updatedOrder = order;
    });

    res.json({ ok: true, order: updatedOrder });

  } catch (error) {
    console.error("Update order status error:", error);

    res.status(error.statusCode || 400).json({
      error: error.message || "Төлөв өөрчлөхөд алдаа гарлаа."
    });

  } finally {
    await session.endSession();
  }
});

// Админ захиалгын барааны өртөг засах
app.patch("/api/admin/orders/:id/items/:index/cost", requireAdmin, async (req, res) => {
  try {
    const index = Number(req.params.index);
    const cost = Number(req.body?.cost);

    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ error: "Барааны индекс буруу байна." });
    }

    if (!Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({ error: "Өртөг 0 буюу түүнээс дээш байх ёстой." });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Захиалга олдсонгүй." });
    }

    if (!order.items || !order.items[index]) {
      return res.status(404).json({ error: "Захиалгын бараа олдсонгүй." });
    }

    order.items[index].cost = cost;
    await order.save();

    res.json({ ok: true, cost, message: "Барааны өртөг хадгалагдлаа." });
  } catch (error) {
    console.error("Update order item cost error:", error);
    res.status(400).json({ error: "Өртөг хадгалахад алдаа гарлаа." });
  }
});

// Бараа нэмэх
app.post("/api/products", requireAdmin, async (req, res) => {
  try {
    const data = req.body || {};
    const product = new Product({
      name: data.name,
      category: data.category,
      price: Number(data.price),
      cost: Number(data.cost || 0),
      stock: Number(data.stock),
      image: data.image || "",
      description: data.description || ""
    });
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({
      error: "Бараа нэмэхэд алдаа гарлаа.",
      detail: error.message
    });
  }
});

// Бараа засах
app.patch("/api/products/:id", requireAdmin, async (req, res) => {
  try {
    const allowed = ["name", "category", "price", "cost", "stock", "image", "description"];
    const updates = {};

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        updates[key] = req.body[key];
      }
    }

    if (updates.price !== undefined) updates.price = Number(updates.price);
    if (updates.stock !== undefined) updates.stock = Number(updates.stock);

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ error: "Бараа олдсонгүй." });
    }

    res.json(product);
  } catch (error) {
    res.status(400).json({
      error: "Бараа засахад алдаа гарлаа.",
      detail: error.message
    });
  }
});

// Бараа устгах
app.delete("/api/products/:id", requireAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ error: "Бараа олдсонгүй." });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: "Бараа устгахад алдаа гарлаа." });
  }
});


// Засварын бүртгэлүүдийг харах
app.get("/api/repairs", requireAdmin, async (req, res) => {
  try {
    const repairs = await Repair.find().sort({ createdAt: -1 }).lean();
    res.json(repairs);
  } catch (error) {
    res.status(500).json({ error: "Бүртгэлүүдийг авахад алдаа гарлаа." });
  }
});

// Шинэ засварын бүртгэл үүсгэх
app.post("/api/repairs", requireAdmin, async (req, res) => {
  try {
    const data = req.body || {};
    const repair = new Repair({
      customerName: data.customerName,
      phone: data.phone,
      bicycleType: data.bicycleType,
      brand: data.brand,
      model: data.model,
      issue: data.issue,
      photos: Array.isArray(data.photos) ? data.photos : [],
      partsUsed: data.partsUsed,
      mechanic: data.mechanic,
      laborCost: data.laborCost,
      partsCost: data.partsCost,
      total: data.total,
      status: data.status,
      paymentStatus: data.paymentStatus,
      notes: data.notes,
      repairNumber: "VX-" + Date.now().toString().slice(-8) +
        Math.floor(100 + Math.random() * 900)
    });

    await repair.save();
    res.status(201).json(repair);
  } catch (error) {
    res.status(400).json({ error: "Бүртгэл үүсгэж чадсангүй.", detail: error.message });
  }
});

// Засварын бүртгэл засах
app.patch("/api/repairs/:id", requireAdmin, async (req, res) => {
  try {
    const allowed = [
      "customerName", "phone", "bicycleType", "brand", "model",
      "issue", "photos", "partsUsed", "mechanic", "laborCost",
      "partsCost", "total", "status", "paymentStatus", "notes"
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }

    const repair = await Repair.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!repair) {
      return res.status(404).json({ error: "Бүртгэл олдсонгүй." });
    }

    res.json(repair);
  } catch (error) {
    res.status(400).json({ error: "Бүртгэл засахад алдаа гарлаа.", detail: error.message });
  }
});

// Засварын бүртгэл устгах
app.delete("/api/repairs/:id", requireAdmin, async (req, res) => {
  try {
    const repair = await Repair.findByIdAndDelete(req.params.id);

    if (!repair) {
      return res.status(404).json({ error: "Бүртгэл олдсонгүй." });
    }

    res.json({ ok: true, message: "Бүртгэл устгагдлаа." });
  } catch (error) {
    res.status(400).json({ error: "Устгах үед алдаа гарлаа." });
  }
});


// Админ статистик

// PHOENIX AI BUSINESS CHAT API
app.post("/api/admin/business-chat", requireAdmin, async (req, res) => {
  try {
    const question = String(req.body.question || "").trim().toLowerCase();

    if (!question || question.length > 300) {
      return res.status(400).json({ error: "Асуултаа зөв оруулна уу." });
    }

    const [products, topProducts, profitData, weeklyOrders] = await Promise.all([
      Product.find({}).select("name stock price cost").sort({ stock: 1 }).lean(),

      Order.aggregate([
        { $match: { status: "Дууссан" } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            quantity: { $sum: "$items.quantity" },
            revenue: {
              $sum: { $multiply: ["$items.price", "$items.quantity"] }
            }
          }
        },
        { $sort: { quantity: -1, revenue: -1 } },
        { $limit: 5 }
      ]),

      Order.aggregate([
        { $match: { status: "Дууссан" } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$_id",
            revenue: {
              $sum: { $multiply: ["$items.price", "$items.quantity"] }
            },
            cost: {
              $sum: {
                $multiply: [
                  { $ifNull: ["$items.cost", 0] },
                  "$items.quantity"
                ]
              }
            },
            costCount: {
              $sum: {
                $cond: [
                  { $ne: [{ $type: "$items.cost" }, "missing"] },
                  1,
                  0
                ]
              }
            },
            itemCount: { $sum: 1 }
          }
        },
        {
          $match: {
            $expr: { $eq: ["$costCount", "$itemCount"] }
          }
        },
        {
          $group: {
            _id: null,
            cost: { $sum: "$cost" },
            profit: {
              $sum: { $subtract: ["$revenue", "$cost"] }
            },
            orders: { $sum: 1 }
          }
        }
      ]),

      Order.aggregate([
        {
          $match: {
            status: "Дууссан",
            createdAt: {
              $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$total" },
            orders: { $sum: 1 }
          }
        }
      ])
    ]);

    const money = value =>
      Number(value || 0).toLocaleString("mn-MN") + " ₮";

    const profit = profitData[0] || {};
    const weekly = weeklyOrders[0] || {};
    let answer;

    if (question.includes("ашиг") || question.includes("өртөг")) {
      answer =
        `📊 PHOENIX ашгийн мэдээлэл:\n` +
        `Нийт ашиг: ${money(profit.profit)}\n` +
        `Бүртгэгдсэн өртөг: ${money(profit.cost)}\n` +
        `Өртөг бүрэн бүртгэгдсэн захиалга: ${profit.orders || 0}\n\n` +
        `Зөвхөн өртөг нь бүрэн бүртгэгдсэн дууссан захиалгыг тооцсон.`;
    } else if (
      question.includes("шилдэг") ||
      question.includes("их зарагдсан") ||
      question.includes("борлуулсан бараа")
    ) {
      answer = topProducts.length
        ? "🏆 Хамгийн их зарагдсан бараанууд:\n" +
          topProducts.map((item, index) =>
            `${index + 1}. ${item._id} — ${item.quantity} ширхэг, ${money(item.revenue)}`
          ).join("\n")
        : "Одоогоор дууссан захиалгын борлуулалт алга.";
    } else if (
      question.includes("нөөц") ||
      question.includes("үлдэгдэл") ||
      question.includes("бараа")
    ) {
      const lowStock = products.filter(item => item.stock <= 5);
      answer = lowStock.length
        ? "⚠️ Нөөц багатай бараанууд:\n" +
          lowStock.map(item => `• ${item.name} — ${item.stock} ширхэг`).join("\n")
        : "5 буюу түүнээс бага үлдэгдэлтэй бараа алга.";
      answer += `\n\nНийт бараа: ${products.length}`;
    } else if (
      question.includes("борлуулалт") ||
      question.includes("орлого") ||
      question.includes("долоо хоног")
    ) {
      const completedOrders = await Order.countDocuments({ status: "Дууссан" });
      answer =
        `📈 Сүүлийн 7 хоногийн үзүүлэлт:\n` +
        `Орлого: ${money(weekly.revenue)}\n` +
        `Дууссан захиалга: ${weekly.orders || 0}\n` +
        `Нийт дууссан захиалга: ${completedOrders}`;
    } else {
      answer =
        "Дараах асуултуудаас сонгоорой:\n" +
        "• Нийт ашиг хэд вэ?\n" +
        "• Хамгийн их зарагдсан бараа юу вэ?\n" +
        "• Нөөц багатай бараануудыг харуул.\n" +
        "• Сүүлийн 7 хоногийн борлуулалт ямар байна?";
    }

    res.set("Cache-Control", "no-store");
    res.json({ answer });
  } catch (error) {
    console.error("Business chat error:", error);
    res.status(500).json({
      error: "Бизнесийн мэдээлэл авахад алдаа гарлаа."
    });
  }
});
// PHOENIX AI BUSINESS CHAT API END

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const previousStart = new Date(start);
    previousStart.setDate(previousStart.getDate() - 7);
    const forecastStart = new Date(now);
    forecastStart.setDate(forecastStart.getDate() - 30);
    const previousForecastStart = new Date(now);
    previousForecastStart.setDate(previousForecastStart.getDate() - 60);

    const customerStart = new Date(now);
    customerStart.setDate(customerStart.getDate() - 30);

    const [counts, revenue, costSummary, daily, topProducts, lowStock, previousWeek, forecastSales, previousForecastSales, allProducts, customerTotals, customerRepeat, topCustomers] = await Promise.all([
      Order.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]),
      Order.aggregate([
        { $match: { status: "Дууссан" } },
        {
          $group: {
            _id: null,
            total: { $sum: "$total" }
          }
        }
      ]),
      Order.aggregate([
        { $match: { status: "Дууссан" } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$_id",
            totalCost: {
              $sum: {
                $multiply: [
                  { $ifNull: ["$items.cost", 0] },
                  "$items.quantity"
                ]
              }
            },
            itemRevenue: {
              $sum: {
                $multiply: ["$items.price", "$items.quantity"]
              }
            },
            costItemCount: {
              $sum: {
                $cond: [
                  { $ne: [{ $type: "$items.cost" }, "missing"] },
                  1,
                  0
                ]
              }
            },
            itemCount: { $sum: 1 }
          }
        },
        {
          $match: {
            $expr: { $eq: ["$costItemCount", "$itemCount"] }
          }
        },
        {
          $group: {
            _id: null,
            totalCost: { $sum: "$totalCost" },
            grossProfit: {
              $sum: { $subtract: ["$itemRevenue", "$totalCost"] }
            },
            orders: { $sum: 1 }
          }
        }
      ]),
      Order.aggregate([
        {
          $match: {
            status: "Дууссан",
            createdAt: { $gte: start }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
            },
            total: { $sum: "$total" },
            orders: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Order.aggregate([
        { $match: { status: "Дууссан" } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            quantity: { $sum: "$items.quantity" },
            revenue: {
              $sum: {
                $multiply: ["$items.price", "$items.quantity"]
              }
            }
          }
        },
        { $sort: { quantity: -1, revenue: -1 } },
        { $limit: 5 }
      ]),
      Product.find({ stock: { $lte: 5 } })
        .select("name category stock")
        .sort({ stock: 1, name: 1 })
        .limit(50)
        .lean(),
      Order.aggregate([
        {
          $match: {
            status: "Дууссан",
            createdAt: { $gte: previousStart, $lt: start }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$total" }
          }
        }
      ]),
      Order.aggregate([
        {
          $match: {
            status: "Дууссан",
            createdAt: { $gte: forecastStart, $lt: now }
          }
        },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            quantity: { $sum: "$items.quantity" }
          }
        }
      ]),
      Order.aggregate([
        {
          $match: {
            status: "Дууссан",
            createdAt: {
              $gte: previousForecastStart,
              $lt: forecastStart
            }
          }
        },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            quantity: { $sum: "$items.quantity" }
          }
        }
      ]),
      Product.find({})
        .select("name stock")
        .sort({ name: 1 })
        .lean(),
      User.countDocuments({}),
      Order.aggregate([
        { $match: { status: "Дууссан", userId: { $exists: true, $ne: null } } },
        { $group: { _id: "$userId", orders: { $sum: 1 } } },
        { $match: { orders: { $gte: 2 } } },
        { $count: "total" }
      ]),
      Order.aggregate([
        { $match: { status: "Дууссан", userId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$userId",
            orderCount: { $sum: 1 },
            totalSpent: { $sum: "$total" },
            lastOrderAt: { $max: "$createdAt" }
          }
        },
        { $sort: { totalSpent: -1, orderCount: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: User.collection.name,
            localField: "_id",
            foreignField: "_id",
            as: "customer"
          }
        },
        { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            name: { $ifNull: ["$customer.name", "Хэрэглэгч"] },
            phone: {
              $cond: [
                { $gte: [{ $strLenCP: { $ifNull: ["$customer.phone", ""] } }, 4] },
                {
                  $concat: [
                    { $substrCP: [{ $ifNull: ["$customer.phone", ""] }, 0, 2] },
                    "****",
                    {
                      $substrCP: [
                        { $ifNull: ["$customer.phone", ""] },
                        { $subtract: [{ $strLenCP: { $ifNull: ["$customer.phone", ""] } }, 2] },
                        2
                      ]
                    }
                  ]
                },
                "Нууцалсан"
              ]
            },
            orderCount: 1,
            totalSpent: 1,
            lastOrderAt: 1
          }
        }
      ])
    ]);

    const forecastProducts = allProducts.map(product => {
      const sold = forecastSales.find(item => item._id === product.name);
      const previousSold = previousForecastSales.find(
        item => item._id === product.name
      );

      const sold30Days = Number(sold?.quantity || 0);
      const previousSold30Days = Number(previousSold?.quantity || 0);

      let trend = "Тогтвортой";
      let trendPercent = 0;

      if (previousSold30Days === 0 && sold30Days > 0) {
        trend = "Шинэ эрэлт";
        trendPercent = null;
      } else if (previousSold30Days > 0) {
        trendPercent = Number(
          (((sold30Days - previousSold30Days) / previousSold30Days) * 100).toFixed(1)
        );

        if (trendPercent > 0) trend = "Өсөж байна";
        else if (trendPercent < 0) trend = "Буурч байна";
      }

      const dailySales = sold30Days / 30;
      const stock = Number(product.stock || 0);
      const daysRemaining = dailySales > 0 ? stock / dailySales : null;
      const suggestedRestock = dailySales > 0
        ? Math.max(Math.ceil(dailySales * 14) - stock, 0)
        : 0;

      return {
        name: product.name,
        stock,
        sold30Days,
        previousSold30Days,
        trend,
        trendPercent,
        dailySales: Number(dailySales.toFixed(2)),
        daysRemaining: daysRemaining === null
          ? null
          : Number(daysRemaining.toFixed(1)),
        suggestedRestock
      };
    });

    const count = status =>
      counts.find(item => item._id === status)?.count || 0;

    res.set("Cache-Control", "no-store");
    res.json({
      totalOrders: counts.reduce((sum, item) => sum + item.count, 0),
      newOrders: count("Шинэ"),
      completedOrders: count("Дууссан"),
      cancelledOrders: count("Цуцалсан"),
      revenue: revenue[0]?.total || 0,
      totalCost: costSummary[0]?.totalCost || 0,
      grossProfit: costSummary[0]?.grossProfit || 0,
      profitTrackedOrders: costSummary[0]?.orders || 0,
      previousWeekRevenue: previousWeek[0]?.total || 0,
      daily,
      topProducts,
      lowStock,
      forecastProducts,
      customerAnalytics: {
        totalCustomers: customerTotals,
        newCustomers30Days: await User.countDocuments({ createdAt: { $gte: customerStart } }),
        repeatCustomers: customerRepeat[0]?.total || 0,
        topCustomers
      }
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ error: "Статистик авахад алдаа гарлаа." });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Серверийн алдаа." });
});

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log("MongoDB connected successfully.");

    // Хуучин захиалгуудыг утасны дугаараар хэрэглэгчтэй холбох
    const users = await User.find().select("_id phone").lean();
    let linkedOrders = 0;

    for (const user of users) {
      const phone = String(user.phone || "").replace(/\D/g, "");
      if (phone.length < 8) continue;

      const result = await Order.updateMany(
        { userId: { $exists: false }, phone },
        { $set: { userId: user._id } }
      );

      linkedOrders += result.modifiedCount || 0;
    }

    console.log(`Legacy orders linked: ${linkedOrders}`);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`PHOENIX API running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
