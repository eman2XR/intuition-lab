// Passes microphone samples from the audio thread to the page, for the live conversation (talk.js).
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('council-capture', Capture);
