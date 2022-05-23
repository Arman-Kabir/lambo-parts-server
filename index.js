const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ct9v9.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
console.log('db connected');

async function run() {
    try {
        await client.connect();
        // console.log('db connected 2nd')
        const partsCollection = client.db('lambo-parts').collection('parts');
        const orderCollection = client.db('lambo-parts').collection('orders');



        // console.log(partsCollection);


        // get all parts
        app.get('/parts', async (req, res) => {
            // const query = {};
            const parts = await partsCollection.find().toArray();
            res.send(parts);
        })
        // get a single parts
        app.get('/parts/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: ObjectId(id) };
            const singleParts = await partsCollection.findOne(query);
            res.send(singleParts);

        })
        // get orders of a specific user
        app.get('/orders', async (req, res) => {
            const user = req.query.userEmail;
            const query = {userEmail:user};
            const orders= await orderCollection.find(query).toArray();
            res.send(orders);
        })
        // order parts
        app.post('/orders', async (req, res) => {
            const orders = req.body;
            const result = await orderCollection.insertOne(orders);
            res.send(result);
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