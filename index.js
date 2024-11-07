const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
//clean logger
const pino = require('pino');

//fs
const fs = require('fs');

//qrcode 
const qrcode = require('qrcode-terminal');

//read .env 
const dotenv = require('dotenv');
dotenv.config();

//decrypt wa
const { getWhatsappImageMedia } = require('./Dec/decryptor.js'); 


//make sock globally if want to used as api
let sock;

async function connectToWhatsApp() {
    const auth = await useMultiFileAuthState("session");
    sock = makeWASocket ({
        printQRInTerminal: true,
        browser: ["Womcat", "Safari", "1.0.0"],
        auth: auth.state,
        logger: pino({ level: "silent"}),
    });
    
    sock.ev.on("creds.update", auth.saveCreds);
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
          const shouldReconnect =
            lastDisconnect.error?.output?.statusCode !==
            DisconnectReason.loggedOut;
          // reconnect if not logged out
          if (shouldReconnect) {
            connectToWhatsApp();
          }
        } else if (connection === "open") {
          console.log("ready");
        }
      });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        sock.sendPresenceUpdate('unavailable');
        const chat = messages[0];
        const msg = ( 
            chat.message?.extendedTextMessage?.text ?? 
            chat.message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
            chat.message?.conversation
        ) || "";
        
        let senderNumber = chat.key.remoteJid.split('@')[0];
        if(chat.key.participant != undefined) {
          senderNumber = chat.key.participant.split('@')[0];
        } 
        
        function isViewOncePhotos() {
          return messages[0].message && messages[0].message.viewOnceMessageV2;
        }
        await sock.readMessages([chat.key]);
        if(isViewOncePhotos()){  // DECRYPT ONE VIEW PHOTOS
      
            const viewOncePhotos = messages[0].message.viewOnceMessageV2;
            const encryptedPhotos = viewOncePhotos.message.imageMessage;
          
            async function decryptImage() {
              try {
                const path = './decryptedimages';
                const decryptedData = await getWhatsappImageMedia(encryptedPhotos);
                if (!fs.existsSync(path)) {
                  fs.mkdirSync(path);
                }
                
                const outputPath = path + '/image_by_' + senderNumber + ".jpg";
                fs.writeFileSync(outputPath, decryptedData);

      
                const imageBuffer = await fs.promises.readFile(outputPath);
                await sock.sendMessage(chat.key.remoteJid, { image: imageBuffer, caption: "Cracked! 😜"}, { quoted: chat });
              } catch (error) {
                console.error('Error decrypting image:', error);
              }
            }
            decryptImage();
        }  
  });
}


connectToWhatsApp();
