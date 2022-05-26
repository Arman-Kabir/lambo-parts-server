const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// for stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ct9v9.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
console.log('db connected');


function verifyJWT(req, res, next) {
    // console.log('abc');
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        // console.log(decoded.foo) // bar
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next();
    });
}


async function run() {
    try {
        await client.connect();
        // console.log('db connected 2nd')
        const partsCollection = client.db('lambo-parts').collection('parts');
        const orderCollection = client.db('lambo-parts').collection('orders');
        const userCollection = client.db('lambo-parts').collection('users');
        const paymentCollection = client.db('lambo-parts').collection('payment');
        const reviewCollection = client.db('lambo-parts').collection('review');
        const profileCollection = client.db('lambo-parts').collection('profile');



        // console.log(partsCollection);

        // payment api
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })

        })



        // put user api
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };

            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            // token creation
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, token });
        });

        // make an user admin
        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        });

        // get all users api
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })

        // get an admin
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })


        // parts
        // get all parts
        app.get('/parts', async (req, res) => {
            // const query = {};
            const parts = await partsCollection.find().toArray();
            res.send(parts);
        })
        // post to parts
        app.post('/parts', async (req, res) => {
            const product = req.body;
            console.log(product);
            // const query = {};
            const result = await partsCollection.insertOne(product);
            res.send(result);
        })

        // get a single parts
        app.get('/parts/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: ObjectId(id) };
            const singleParts = await partsCollection.findOne(query);
            res.send(singleParts);

        })
        // delete a parts // verifyjwt
        app.delete('/parts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await partsCollection.deleteOne(query);
            res.send(result);
        })



        // orders
        // get all orders for admin
        app.get('/allorders', verifyJWT, async (req, res) => {
            const result = await orderCollection.find().toArray();
            res.send(result);
        })

        // delete an order for admin
        app.delete('/allorders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(query);
            res.send(result);
        })

        // update status of an order for admin
        app.put('/allorders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: { status: 'shipped' },
            };

            const result = await orderCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // get orders of a specific user // 
        app.get('/orders', verifyJWT, async (req, res) => {
            const user = req.query.userEmail;
            const decodedEmail = req.decoded.email;

            if (user === decodedEmail) {
                const query = { userEmail: user };
                const orders = await orderCollection.find(query).toArray();
                return res.send(orders);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }

        })

        // post order parts
        app.post('/orders', async (req, res) => {
            const orders = req.body;
            const result = await orderCollection.insertOne(orders);
            res.send(result);
        })

        // payment updated api order
        app.patch('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const transaction = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    payment: 'true',
                    transactionId: transaction.transactionId,
                }
            }
            const result = await paymentCollection.insertOne(transaction);
            const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
            res.send(updatedDoc);
        })

        // get an order for payment
        app.get('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const order = await orderCollection.findOne(query);
            // console.log(order);
            res.send(order);
        })



        //   review
        // add review api
        app.post('/review', async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        })
        // get review
        app.get('/review', async (req, res) => {
            const review = await reviewCollection.find().toArray();
            res.send(review);
        })



        // my profile
        // add to my profile api
        app.post('/profile/:email', async (req, res) => {
            const email = req.params.email;
            const profile = req.body;
            const filter = { email: email };
            // const options = { upsert: true };
            // const updateDoc = {
            //     $set: {
            //         profile
            //     },
            // };
            // console.log(profile, filter, updateDoc);
            const result = await profileCollection.insertOne(profile);
            res.send(result);
        })

        // update to my profile api
        app.put('/profile/:email', async (req, res) => {
            const email = req.params.email;
            const profile = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    name: profile.name,
                    email: profile.email,
                    education: profile.education,
                    location: profile.location,
                    phone: profile.phone,
                    linkedin: profile.linkedin,
                },
            };
            // console.log(profile, filter, updateDoc);
            const result = await profileCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        // get profile of a specific user // 
        app.get('/profile', verifyJWT, async (req, res) => {
            const user = req.query.userEmail;
            const decodedEmail = req.decoded.email;

            if (user === decodedEmail) {
                const query = { email: user };
                const profile = await profileCollection.findOne(query);
                return res.send(profile);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }

        })

    }
    finally {

    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})