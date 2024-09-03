import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure"
import { Relay } from "nostr-tools/relay"
import { writeFile, readFile } from "fs/promises";

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));
const file_save = async (filename, content) => {
    try {
        await writeFile(filename, content, "utf8");
    } catch (err) {
        throw err;
    }
}
const file_read = async (filename) => {
    try {
        const data = await readFile(filename, "utf8");
        return data;
    } catch (err) {
        throw err;
    }
}
const plamo_provide = async (content) => {
    const response = await fetch(plamo_url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${plamo_auth}`,
            "Content-Type": "application/json"
        },
        body: `{"messages":[{"role":"system","content":"you are japanese PLaMo"},{"role":"user","content":"${content}"}],"model":"plamo-beta"}`
    })
    const json = await response.json()
    try {
        const text = json.choices[0].message.content
        return text
    } catch (err) {
        return "Error: " + err
    }
}
const post = async (message) => {
    const event = finalizeEvent({
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: message,
    }, sk)
    await relay.publish(event)
}
const reply = async (message, target) => {
    const event = finalizeEvent({
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ["e", target.id],
            ["p", target.pubkey],
        ],
        content: message,
    },sk)
    await relay.publish(event)
}
const callback = async (event) => {
    if (event.pubkey == pk) return
    if (!event.content.startsWith("sxc.")) return
    const message = event.content.slice(4)
    if (message.startsWith("plamo.")) {
        const plamo_result = await plamo_provide(message.slice(6))
        await reply(plamo_result, event)
    }
    else if(message.startsWith("ping")) {
        await reply("pong.", event)
    }
    else if (message.startsWith("exit")) {
        process.exit(0)
    }
}


const relay_url = "wss://yabu.me"
const plamo_url = "https://platform.preferredai.jp/api/completion/v1/chat/completions"
const plamo_auth = "NjZjZTgyYjYyOWZlYTg1NDQ1N2YwYWM1OlVTcnIyTmpiUzNlRkNnNHhybGhGTWZrMFk4a3B3S1Ix"
// const sk = generateSecretKey()
// await file_save("key.txt", Buffer.from(sk).toString("hex"))
const sk = Uint8Array.from(Buffer.from(await file_read("key.txt"), "hex"))
const pk = getPublicKey(sk)
const relay = await Relay.connect(relay_url)

relay.subscribe([
    {
        kinds: [1],
        since: Math.floor(Date.now() / 1000)
    },
], {
    onevent(event) {
        callback(event)
    }
})
