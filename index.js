const express = require('express');
const axios = require('axios');
const dotenv = require("dotenv");
const { v4: uuidv4 } = require('uuid');
const querystring = require("querystring");
const sound = require("sound-play");
const fs = require('fs');
const path = require("path");
const Microphone = require('node-microphone');
const wav = require('wav');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const { join } = require('node:path');
const recorder = require('node-record-lpcm16')
const AudioRecorder = require('node-audiorecorder')

const app = express();
const server = createServer(app);
const io = new Server(server);

dotenv.config();
const port = 3000;

const directoryPath = path.join(__dirname, '/audios');
fs.readdir(directoryPath, (err, files) => {
    if (err) {
        console.error('Error reading directory:', err);
        return;
    }

    // Loop through each file and delete it
    files.forEach((file) => {
        const filePath = path.join(directoryPath, file);

        // Delete the file
        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
                console.error(`Error deleting file ${file}:`, unlinkErr);
            } else {
                console.log(`File deleted successfully`);
            }
        });
    });
});

function stringToValidId(inputString) {
    // Replace characters other than A-Z, a-z, 0-9, underscores, and dashes with underscores
    const sanitizedString = inputString.replace(/[^A-Za-z0-9_\-]/g, '_');
    return sanitizedString;
}

const announcements = [
    "Get ready to rock with [artist name]'s latest smash hit, '[song title]'!",
    "Calling all party animals! [artist name] is about to drop the beat with '[song title]'.",
    "Let's take a breather and enjoy the soulful vibes of [artist name]'s ballad, '[song title]'.",
    "Time for a blast from the past! Pump up the volume for the 80s classic, '[song title]' by [artist name].",
    "Put on your dancing shoes! [artist name] is giving a fresh twist to a classic with '[song title]'.",
    "Need a mood boost? Listen to the cheerful and upbeat '[song title]' by [artist name].",
    "Love is in the air! Dedicate this romantic ballad, '[song title]', to someone special by [artist name].",
    "Feel the rhythm with the Latin beats of '[song title]' by [artist name]. It's caliente!",
    "Double the fun! Join [artist name] and another special artist in their epic collaboration, '[song title]'.",
    "Let's close the show with a bang! Pump up the energy with the high-octane dance track, '[song title]', by [artist name].",
    "Let's dive into the music world with [artist name]'s latest track, '[song title]'.",
    "Up next is a fantastic piece of music by [artist name]. Get ready for '[song title]'.",
    "Take a musical journey with us as we explore the sounds of [artist name] in '[song title]'.",
    "We're about to experience a masterpiece from [artist name]. Listen closely to '[song title]'.",
    "Discover the artistry of [artist name] in their latest creation, '[song title]'.",
    "Our next song is a hidden gem from [artist name]. Enjoy the enchanting melody of '[song title]'.",
    "Get lost in the rhythm and melody of '[song title]' by [artist name].",
    "Experience the harmonious blend of vocals and instrumentals in [artist name]'s '[song title]'.",
    "Coming up is a timeless piece from [artist name]. Let the soothing sounds of '[song title]' fill the air.",
    "Join us on a musical adventure with [artist name]'s captivating composition, '[song title]'.",
    "Stay tuned for a musical treat as [artist name] shares their talent in '[song title]'.",
    "Our playlist is about to shine with the brilliance of [artist name]'s '[song title]'.",
    "Feel the magic of music with [artist name]'s latest release, '[song title]'.",
    "We're about to hit the play button on [artist name]'s soulful creation, '[song title]'.",
    "Unwind and enjoy the beauty of '[song title]' by [artist name].",
    "Coming up is a delightful tune from [artist name]. Get ready for the joyous vibes of '[song title]'.",
    "Let the music take center stage as we feature [artist name]'s '[song title]'.",
    "Embark on a musical adventure with the sounds of [artist name]'s '[song title]'.",
    "Prepare to be moved by the emotive performance of [artist name] in '[song title]'.",
    "Our next selection is a testament to the diversity of music. Listen to '[song title]' by [artist name].",
];

function getRandomAnnouncement(artistName, songTitle) {
    // Get a random index from the announcements list
    const randomIndex = Math.floor(Math.random() * announcements.length);

    // Get the announcement template
    const announcementTemplate = announcements[randomIndex];

    // Replace placeholders with actual artistName and songTitle
    const announcement = announcementTemplate
        .replace("[artist name]", artistName)
        .replace("[song title]", songTitle);

    // Return the modified announcement
    console.log("\n«", announcement, "»\n");
    return announcement;
}

async function saveAudio(id, url) {
    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
        });

        const filePath = `audios/audio_${stringToValidId(id)}.wav`;

        const fileStream = fs.createWriteStream(filePath);
        response.data.pipe(fileStream);

        return filePath;
    } catch (error) {
        console.error(`Error saving audio: ${error}`);
    }
}


async function playAudio(id, callback) {
    const filePath = path.join(__dirname, `audios/audio_${stringToValidId(id)}.wav`);
    try {
        await sound.play(filePath, 1);
        console.log("done playing audio");
        if (callback && typeof callback === 'function') {
            callback(); // Execute the callback
        }

        // Delete the file after playing
        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
                console.error(`Error deleting file:`, unlinkErr);
            } else {
                console.log("File deleted successfully");
            }
        });
    } catch (error) {
        console.error(error);
    }
}

function playSound(url) {
    axios({
        method: 'get',
        url: url,
        responseType: 'stream',
    })
        .then(response => {
            const fileStream = fs.createWriteStream('audio.wav');
            response.data.pipe(fileStream);
            fileStream.on('close', () => {
                // Now that the file is downloaded, play it
                const filePath = path.join(__dirname, "audio.wav");
                sound.play(filePath, 1);
            });
        })
        .catch(error => {
            console.error(`Error downloading audio: ${error}`);
        });
}

let spotify = {
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    bearer: {
        access_token: null,
        expires_in: null,
        refresh_token: null,
    },
    spotify_token: null,
    redirect_uri: 'http://localhost:3000/redirect',
    code: null,
}

let generatedTTSs = {}
let pendingTTSs = []

function generateUUID() {
    const uuid = uuidv4();
    return uuid;
}

function requestSpotifyToken({ id, secret }) {
    axios({
        method: "post",
        url: "https://accounts.spotify.com/api/token",
        data: `grant_type=client_credentials&client_id=${id}&client_secret=${secret}`,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    })
        .then(function (response) {
            // handle success
            console.log(response.data);
            if (response.data.access_token) {
                spotify.spotify_token = response.data.access_token;
            }
        })
        .catch(function (error) {
            // handle error
            console.log(error);
        });
}

requestSpotifyToken({ id: spotify.client_id, secret: spotify.client_secret });

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/pages/index.html');
});

app.get('/login/spotify', (req, res) => {
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: spotify.client_id,
            scope: "user-read-playback-state user-modify-playback-state user-read-currently-playing app-remote-control user-read-email",
            redirect_uri: spotify.redirect_uri,
            state: generateUUID(),
        }));
});


// let mic = new Microphone({ useDataEmitter: true });
// mic.on('error', (err) => {
//     console.error('Microphone error:', err);
// });
// let micStream = mic.startRecording();
// micStream.on('error', (err) => {
//     console.error('Microphone error:', err);
// });


const writableStream = new (require('stream').Writable)();
writableStream._write = (chunk, encoding, next) => {
    // Send the audio data to connected clients
    io.emit('audio', chunk.buffer);
    next();
};


const recording = recorder.record({
    sampleRate: 16000,
    channels: 1,
})
recording.stream().pipe(writableStream);


const options = {
    program: `sox`, // Which program to use, either `arecord`, `rec`, or `sox`.
    device: null, // Recording device to use, e.g. `hw:1,0`

    bits: 16, // Sample size. (only for `rec` and `sox`)
    channels: 1, // Channel count.
    encoding: `signed-integer`, // Encoding type. (only for `rec` and `sox`)
    format: `S16_LE`, // Encoding type. (only for `arecord`)
    rate: 16000, // Sample rate.
    type: `wav`, // Format type.

    // Following options only available when using `rec` or `sox`.
    silence: 2, // Duration of silence in seconds before it stops recording.
    thresholdStart: 0.5, // Silence threshold to start recording.
    thresholdStop: 0.5, // Silence threshold to stop recording.
    keepSilence: true, // Keep the silence in the recording.
}

let audioRecorder = new AudioRecorder(options)

audioRecorder.start().stream().pipe(writableStream);



// recorder.on('data', (data) => {
//     io.emit('audio', chunk.buffer);
//     console.log('sent data of size ' + chunk.length);
// });

// micStream.on('data', (chunk) => {
//     // Emit the audio chunk to connected clients
//     io.emit('audio', chunk.buffer);
//     console.log('sent data of size ' + chunk.length);
// });



// some tests:
// const wavStream = new wav.Writer({
//     channels: 1,        // Mono
//     sampleRate: 16000,   // Adjust as needed
//     bitDepth: 16         // Adjust as needed
// });
// micStream.pipe(wavStream);
// wavStream.pipe(res);

io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

app.get('/stream', (req, res) => {
    res.sendFile(__dirname + '/pages/stream.html');
});

app.get('/redirect', (req, res) => {
    if (req.query.code) {
        spotify.code = req.query.code;
        axios({
            method: "post",
            url: "https://accounts.spotify.com/api/token",
            headers: {
                "Authorization": "Basic " + (Buffer.from(spotify.client_id + ':' + spotify.client_secret).toString('base64')),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data: {
                code: req.query.code,
                redirect_uri: spotify.redirect_uri,
                grant_type: 'authorization_code'
            },
            json: true
        })
            .then(function (response) {
                console.log(response.data);
                if (response.data.access_token) {
                    spotify.bearer.access_token = response.data.access_token;
                    spotify.bearer.expires_in = response.data.expires_in;
                    spotify.bearer.refresh_token = response.data.refresh_token;
                    res.redirect('/');
                }
            })
            .catch(function (error) {
                // handle error
                console.log(error);
            });
    }
});

app.get('/api/playback-state', (req, res) => {
    axios({
        method: "get",
        url: "https://api.spotify.com/v1/me/player?market=FR",
        headers: {
            "Authorization": "Bearer " + spotify.bearer.access_token,
        },
    })
        .then(function (response) {
            // handle success
            // console.log(response.data.item.name);
            // console.log(response.data.item.artists[0].name);
            res.send(response.data);
        })
        .catch(function (error) {
            // handle error
            console.log(error);
        });
});

let current;
let nextInferenceJobTokenToPlay;
setInterval(() => {
    (async () => {
        await checkInterval();
    })();
}, 5000);

async function checkInterval() {
    if (spotify.bearer.access_token) {
        try {
            let cObj = await getCurrent();
            if (current != cObj.id) {
                if (nextInferenceJobTokenToPlay) {
                    console.log('Play DJ!');
                    setVolume(40);
                    playAudio(nextInferenceJobTokenToPlay, () => {
                        setVolume(60);
                    });
                }
                current = cObj.id;
                console.log(cObj.name, "-", cObj.artists[0].name);
                let nObj = await getNext();
                let queued = await queueTTS(getRandomAnnouncement(nObj.artists[0].name, nObj.name));
                // console.log(">>>", queued);
                nextInferenceJobTokenToPlay = queued.inference_job_token;
            }
        } catch (error) {
            // Handle the error if needed
            console.error(error);
        }
    }
}

async function getCurrent() {
    try {
        const response = await axios({
            method: "get",
            url: "https://api.spotify.com/v1/me/player?market=FR",
            headers: {
                "Authorization": "Bearer " + spotify.bearer.access_token,
            },
        });
        return response.data.item;
    } catch (error) {
        console.error(error);
        throw error; // Re-throw the error so it can be caught by the calling code
    }
}


// queueTTS(`And now, we're going to turn it up to 11 with the new hit single!`);

const VOICES = {
    DJ:"TM:qy7x74k31ejh",
    C3PO:"TM:j8vkdsjjhetn",
    MICKEY:"TM:ar1cc7b9k3s8",
    MR_BEAST:"TM:r1jbtkgnc6ep",
}
async function queueTTS(text) {
    try {
        const response = await axios({
            method: "post",
            url: "https://api.fakeyou.com/tts/inference",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            data: {
                "uuid_idempotency_token": generateUUID(),
                "tts_model_token": VOICES.DJ,
                "inference_text": text,
            }
        });
        if (response.data.success) {
            pendingTTSs[response.data.inference_job_token] = {};
            pendingTTSs[response.data.inference_job_token].interval =
                setInterval(processTtsStatus(response.data.inference_job_token), 5000);
        }
        return response.data;
    } catch (error) {
        console.error(error);
        throw error; // Re-throw the error so it can be caught by the calling code
    }
}

function processTtsStatus(inference_job_token) {
    return async () => {
        try {
            let status = await checkTtsStatus(inference_job_token);
            if (status.state.status === "complete_success") {
                generatedTTSs[inference_job_token] = { ...status };
                console.log('save', inference_job_token);
                saveAudio(inference_job_token, `https://storage.googleapis.com/vocodes-public${status.state.maybe_public_bucket_wav_audio_path}`);
                // console.log(generatedTTSs);
                clearInterval(pendingTTSs[inference_job_token].interval);
            }
        } catch (error) {
            console.error(error);
        }
    };
}

async function checkTtsStatus(inference_job_token) {
    try {
        const response = await axios({
            method: "get",
            url: "https://api.fakeyou.com/tts/job/" + inference_job_token,
            headers: {
                "Accept": "application/json",
            },
        });
        // console.log(response.data);
        return response.data;
    } catch (error) {
        console.error(error);
        throw error; // Re-throw the error so it can be caught by the calling code
    }
}

async function getNext() {
    try {
        const response = await axios({
            method: "get",
            url: "https://api.spotify.com/v1/me/player/queue",
            headers: {
                "Authorization": "Bearer " + spotify.bearer.access_token,
            },
        });
        return response.data.queue[0];
    } catch (error) {
        console.error(error);
        throw error; // Re-throw the error so it can be caught by the calling code
    }
}

async function setVolume(v) {
    try {
        const response = await axios({
            method: "put",
            url: "https://api.spotify.com/v1/me/player/volume?volume_percent=" + v,
            headers: {
                "Authorization": "Bearer " + spotify.bearer.access_token,
            },
        });
        return response.data;
    } catch (error) {
        console.error(error);
        throw error; // Re-throw the error so it can be caught by the calling code
    }
}

app.use(express.static('public'));

server.listen(port, async () => {
    const open = await import('open');
    console.log(`SuperQueue listening on port ${port}\nOpening new login tab.`);
    open.default('http://localhost:3000/login/spotify');
});
