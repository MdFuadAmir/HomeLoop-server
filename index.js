//===================== dependencies import ====================//
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const admin = require("firebase-admin");
dotenv.config();
const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
//===================== express app setup ====================//
const app = express();
const port = process.env.PORT || 3000;
//===================== middleware ====================//
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
//===================== firebase admin setup ====================//
const serviceAccount = require("./firebase-Admin-Key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//===================== MongoDB connection string ====================//
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sldyvva.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
//===================== main run function ====================//
async function run() {
  try {
    // await client.connect();
    //================= DB collections =================//
    const db = client.db("HouseLoop");
    const usersCollection = db.collection("users");
    const roomsCollection = db.collection("rooms");
    const bookingsCollection = db.collection("bookings");
    //====================== email sending middleeare ==========================//
    const sendEmail = (emailAddress, emailData) => {
      // Create a test account or replace with real credentials.
      const transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com", // fixed for gmail er email server
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.TRANSPORTER_EMAIL,
          pass: process.env.TRANSPORTER_PASS,
        },
      });
      // verifi transpoter
      transporter.verify((error, success) => {
        if (error) {
          console.error(error);
        } else {
          console.log("Server is ready to take our messages");
        }
      });
      const mailBody = {
        from: `"HouseLoop" <${process.env.TRANSPORTER_EMAIL}>`,
        to: emailAddress,
        subject: emailData.subject,
        html: emailData.message,
      };
      transporter.sendMail(mailBody, (error, info) => {
        if (error) {
          console.log(error);
        } else {
          console.log("Email send:" + info.response);
        }
      });
    };
    // passs: djjv gsog kiut jxjx

    //======================= verified middleware api======================//
    // 🔹 Firebase token verify middleware
    const verifyFBToken = async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        // 1️⃣ Token check
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return res
            .status(401)
            .send({ success: false, message: "Unauthorized: Token missing" });
        }
        const token = authHeader.split(" ")[1];
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        console.error("Token verification error:", error.message);
        if (error.code === "auth/argument-error") {
          return res
            .status(400)
            .send({ success: false, message: "Bad token format" });
        }
        res.status(403).send({ success: false });
      }
    };
    // verified admin middleware
    const verifyAdmin = async (req, res, next) => {
      try {
        const email = req?.decoded?.email;
        const query = { email };
        const user = await usersCollection.findOne(query);
        if (!user || user?.role !== "admin") {
          return res
            .status(403)
            .send({ message: "Forbidden: Admin access only" });
        }
        next();
      } catch (error) {
        console.error("Admin verify error:", error);
        res.status(500).send({ message: "Server error during admin check" });
      }
    };
    // verified host middleware
    const verifyHost = async (req, res, next) => {
      try {
        const email = req?.decoded?.email;
        const query = { email };
        const user = await usersCollection.findOne(query);
        if (!user || user?.role !== "host") {
          return res
            .status(403)
            .send({ message: "Forbidden: Host access only" });
        }
        next();
      } catch (error) {
        console.error("Host verify error:", error);
        res.status(500).send({ message: "Server error during host check" });
      }
    };
    //======================= user management api ======================//
    // 🔹 Create user
    app.post("/users", async (req, res) => {
      try {
        const email = req?.body?.email;
        const userExist = await usersCollection.findOne({ email });
        if (userExist) {
          return res.status(200).send({
            message: "User already exists...",
            success: false,
          });
        }
        const user = req.body;
        const result = await usersCollection.insertOne(user);
        // send email for crating account
        sendEmail(user?.email, {
          subject: "Welcome to HouseLoop !",
          message: `Brows room and booked them`,
        });
        return res.status(201).send({
          success: true,
          message: "New user created successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Server error",
          error: error.message,
        });
      }
    });
    // PATCH: update user role
    app.patch(
      "/users/update/:email",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const { role } = req.body;
        const query = { email };
        const updateDoc = {
          $set: {
            role,
            status: "verified",
            updatedAt: new Date(),
          },
        };
        const result = await usersCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );
    // Get all user
    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.get("/users/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

    //======================= rooms api=============================//
    app.post("/rooms", verifyFBToken, verifyHost, async (req, res) => {
      try {
        const roomData = req.body;
        const result = await roomsCollection.insertOne(roomData);
        res.send(result);
      } catch (error) {
        console.log(error);
      }
    });
    // get all rooms by host
    app.get(
      "/my-listings/:email",
      verifyFBToken,
      verifyHost,
      async (req, res) => {
        try {
          const email = req.params.email;
          const query = { "host.email": email };
          const result = await roomsCollection.find(query).toArray();
          res.send(result);
        } catch (error) {
          console.log(error);
        }
      }
    );
    // get all rooms by category
    app.get("/rooms", async (req, res) => {
      try {
        const category = req.query.category;
        let query = {};
        if (category && category !== "null") query = { category };
        const result = await roomsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching rooms:", error);
        res.status(500).send({ message: "Failed to fetch rooms" });
      }
    });
    // get a single room for show details
    app.get("/rooms/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await roomsCollection.findOne(query);
        res.send(result);
      } catch (error) {
        console.log("single room finding error", error);
        res.send(error);
      }
    });
    // delete a room
    app.delete("/room/:id", verifyFBToken, verifyHost, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await roomsCollection.deleteOne(query);
      res.send(result);
    });
    // update room data
    app.put("/rooms/update/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const roomData = req.body;
        delete roomData._id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Room ID" });
        }

        const query = { _id: new ObjectId(id) };
        const updatedDoc = { $set: roomData };

        const result = await roomsCollection.updateOne(query, updatedDoc);
        res.send(result);
      } catch (error) {
        console.error("🔥 Update Error:", error);
        res.status(500).send({ message: error.message });
      }
    });
    //===================== payment api===============================//
    // creat payment intent
    app.post("/create-payment-intent", verifyFBToken, async (req, res) => {
      const { price } = req.body;
      if (!price) {
        return res.status(400).json({ error: "Amount is required" });
      }
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(price * 100), //priceInCent,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(400).send({ error: error.message });
      }
    });
    // pay and booking room
    app.post("/bookings", verifyFBToken, async (req, res) => {
      const bookingData = req.body;
      const result = await bookingsCollection.insertOne(bookingData);
      // send email guest
      sendEmail(bookingData?.paymentMethod?.billing_details?.email, {
        subject: "Booking Successfull !",
        message: `You've successfully booked a room through HouseLoop. Transection Id: ${bookingData?.transactionId} `,
      });
      // send email host
      sendEmail(bookingData?.host?.email, {
        subject: "Your Room got Booked !",
        message: `Get ready to welcome ${bookingData?.paymentMethod?.billing_details?.name}`,
      });
      res.send(result);
    });
    // pay to update status
    app.patch("/room/status/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: new ObjectId(id) };
      const updateRoom = { $set: { booked: status } };
      const result = await roomsCollection.updateOne(query, updateRoom);
      res.send(result);
    });
    // get booking data for a user
    app.get("/bookings/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const query = { "paymentMethod.billing_details.email": email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });
    // manage booking only host
    app.get(
      "/manage-bookings/:email",
      verifyFBToken,
      verifyHost,
      async (req, res) => {
        const email = req.params.email;
        const query = { "host.email": email };
        const result = await bookingsCollection.find(query).toArray();
        res.send(result);
      }
    );
    // delete booking
    app.delete("/booking/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });
    //====================== statistic api==========================//
    // for admin
    app.get("/admin-stat", verifyFBToken, verifyAdmin, async (req, res) => {
      const bookingDetails = await bookingsCollection
        .find(
          {},
          {
            projection: {
              date: 1,
              totalAmount: 1,
            },
          }
        )
        .toArray();
      const totalPrice = bookingDetails.reduce(
        (sum, booking) => sum + (booking.totalAmount || 0),
        0
      );
      const totalUsers = await usersCollection.countDocuments();
      const totalRooms = await roomsCollection.countDocuments();
      const totalBooking = bookingDetails.length;
      const chartData = bookingDetails.map((booking) => {
        const day = new Date(booking.date).getDate();
        const month = new Date(booking.date).getMonth() + 1;
        const data = [`${day}/${month}`, booking.totalAmount];
        return data;
      });
      chartData.unshift(["Date", "Sales"]);
      res.send({ totalUsers, totalRooms, totalBooking, totalPrice, chartData });
    });
    // for host
    app.get(
      "/host-stat/:email",
      verifyFBToken,
      verifyHost,
      async (req, res) => {
        const { email } = req.params;
        const bookingDetails = await bookingsCollection
          .find(
            { "host.email": email },
            {
              projection: {
                date: 1,
                totalAmount: 1,
              },
            }
          )
          .toArray();
        const totalRooms = await roomsCollection.countDocuments({
          "host.email": email,
        });
        const totalPrice = bookingDetails.reduce(
          (sum, booking) => sum + (booking.totalAmount || 0),
          0
        );
        const totalBooking = bookingDetails.length;

        const chartData = bookingDetails.map((booking) => {
          const day = new Date(booking.date).getDate();
          const month = new Date(booking.date).getMonth() + 1;
          const data = [`${day}/${month}`, booking.totalAmount];
          return data;
        });
        chartData.unshift(["Date", "Sales"]);
        res.send({ totalRooms, totalBooking, totalPrice, chartData });
      }
    );
    // for guest
    app.get("/guest-stat/:email", verifyFBToken, async (req, res) => {
      const { email } = req.params;
      const bookingDetails = await bookingsCollection
        .find(
          { "paymentMethod.billing_details.email": email },
          {
            projection: {
              date: 1,
              totalAmount: 1,
            },
          }
        )
        .toArray();
      const totalPrice = bookingDetails.reduce(
        (sum, booking) => sum + (booking.totalAmount || 0),
        0
      );
      const totalBooking = bookingDetails.length;
      const chartData = bookingDetails.map((booking) => {
        const day = new Date(booking.date).getDate();
        const month = new Date(booking.date).getMonth() + 1;
        const data = [`${day}/${month}`, booking.totalAmount];
        return data;
      });
      chartData.unshift(["Date", "Sales"]);
      res.send({ totalBooking, totalPrice, chartData });
    });
    //================= MongoDB connection test =================//
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
//========================= simple root route ========================//
app.get("/", (req, res) => {
  res.send("HouseLoop server is running");
});
//================= Start server =================//
app.listen(port, () => {
  console.log(`HouseLoop server is listening on port: ${port}`);
});
