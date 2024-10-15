const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const {Web3} = require('web3');
require('dotenv').config()

// Replace with your bot's API token
const TOKEN = process.env['TOKEN'];
// Replace with your Pinata API details or IPFS endpoint
const PINATA_API_KEY = process.env['PINATA_API_KEY'];
const PINATA_SECRET_API_KEY = process.env['pinata_secret_api_key'];
const PINATA_API_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

// Scroll Sepolia testnet details
const RPC_URL = 'https://aia-dataseed1-testnet.aiachain.org';
const PRIVATE_KEY = process.env['privatekey'];
const CONTRACT_ADDRESS = '0x277FF7a65C5BC3B1e897FE978de18F979f38ed61';
const ABI =[
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "string",
          "name": "ipfsHash",
          "type": "string"
        }
      ],
      "name": "HashStored",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "ipfsHash",
          "type": "string"
        }
      ],
      "name": "storeHash",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ]

// Create a bot instance
const bot = new TelegramBot(TOKEN, { polling: true });

// Setup Web3
const web3 = new Web3(RPC_URL);
const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
web3.eth.accounts.wallet.add(account);
const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

// Function to handle file upload to IPFS
const uploadToIPFS = async (filePath) => {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    const pinataResponse = await axios.post(PINATA_API_URL, formData, {
        headers: {
            ...formData.getHeaders(),
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_API_KEY
        }
    });

    return `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`;
};

// Function to store IPFS hash on Scroll Sepolia testnet
const storeHashOnBlockchain = async (ipfsHash) => {
    try {
        const transaction = contract.methods.storeHash(ipfsHash);
        const options = {
            to: contract.options.address,
            data: transaction.encodeABI(),
            gas: await transaction.estimateGas({ from: account.address }),
            gasPrice: await web3.eth.getGasPrice(),
            from: account.address, // Ensure from address is set
        };        

        const signedTx = await web3.eth.accounts.signTransaction(options, PRIVATE_KEY);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log(`Transaction hash: ${receipt.transactionHash}`);
        return receipt.transactionHash;
    } catch (error) {
        console.error('Error storing hash on blockchain:', error);
        throw error; // Propagate the error further if needed
    }
};


// Function to process media file from Telegram and upload to IPFS
const processMedia = async (chatId, fileId, extension) => {
    try {
        // Get the file path
        const file = await bot.getFile(fileId);
        const filePath = file.file_path;
        const url = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
        console.log('File URL:', url);

        // Download the file
        const response = await axios.get(url, { responseType: 'stream' });
        const tempPath = path.join(__dirname, `temp.${extension}`);
        const writer = fs.createWriteStream(tempPath);

        response.data.pipe(writer);

        writer.on('finish', async () => {
            try {
                // Upload to IPFS
                const ipfsLink = await uploadToIPFS(tempPath);

                // Store IPFS hash on blockchain
                const txHash = await storeHashOnBlockchain(ipfsLink);
                console.log(`Transaction hash: ${txHash}`);

                // Send the IPFS link and transaction hash to the user
                bot.sendMessage(chatId, `Your file is uploaded to IPFS: ${ipfsLink}`);
                bot.sendMessage(chatId, `Transaction hash: ${txHash}`);

                // Clean up the temp file
                fs.unlinkSync(tempPath);
            } catch (error) {
                console.error('Error uploading to IPFS or storing hash on blockchain:', error);
                bot.sendMessage(chatId, 'There was an error uploading your file to IPFS or storing the hash on blockchain.');
            }
        });

        writer.on('error', (err) => {
            console.error('Error writing file:', err);
            bot.sendMessage(chatId, 'There was an error processing your file.');
        });

    } catch (error) {
        console.error('Error fetching file from Telegram:', error);
        bot.sendMessage(chatId, 'There was an error fetching your file from Telegram.');
    }
};

console.log('Bot Is Running.......')
// Listen for any kind of message
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;
        await processMedia(chatId, fileId, 'jpg');
    } else if (msg.video) {
        const video = msg.video;
        const fileId = video.file_id;
        await processMedia(chatId, fileId, 'mp4');
    } else {
        bot.sendMessage(chatId, 'Please send a JPG, PNG image or a video.');
    }
});
