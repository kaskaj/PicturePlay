class RgbFullSynth extends AudioWorkletProcessor {
    constructor() {
        super();
        this.config = null;
        this.t = 0;
        this.samplesPerColumn = 0;

        this.port.onmessage = (event) => {
            if (event.data.type === "config") {
                this.config = event.data;
                this.samplesPerColumn = Math.floor(
                    this.config.durationPerColumn * this.config.sampleRate
                );
                this.t = 0;
            }
        };
    }

    process(inputs, outputs) {
        if (!this.config) return true;

        const output = outputs[0];
        const L = output[0];
        const R = output[1] || output[0];

        const {pixelData, baseFreq, sampleRate} = this.config;
        const {width, height, data} = pixelData;

        for (let i = 0; i < L.length; i++) {
            let col = Math.floor(this.t / this.samplesPerColumn) % width;
            const sampleIndex = this.t % this.samplesPerColumn;
            const time = sampleIndex / sampleRate;

            let left = 0;
            let right = 0;

            for (let y = 0; y < height; y++) {
                const idx = (y * width + col) * 4;
                const rVal = data[idx] / 255;
                const gVal = data[idx + 1] / 255;
                const bVal = data[idx + 2] / 255;

                // amplitude = vector magnitude
                const amp = Math.sqrt(rVal * rVal + gVal * gVal + bVal * bVal);
                if (amp < 0.001) continue;

                // base frequency for this harmonic
                const freqBase = baseFreq * (y + 1);

                // detune = ±5% from green channel
                const detuneFactor = 1 + (gVal - 0.5) * 0.1;
                const freq = freqBase * detuneFactor;

                // phase = red channel maps to [0, 2π]
                const phase = rVal * 2 * Math.PI;

                // oscillator sample
                const s = amp * Math.sin(2 * Math.PI * freq * time + phase);

                // stereo pan from blue channel [0 = left, 1 = right]
                const pan = bVal;
                const lGain = Math.cos(pan * Math.PI / 2);
                const rGain = Math.sin(pan * Math.PI / 2);

                left += s * lGain;
                right += s * rGain;
            }

            // scale down global level
            left = left / height;
            right = right / height;
            L[i] = left * 0.8;  // louder scaling after normalization
            R[i] = right * 0.8;

            this.t++;
        }

        return true;
    }
}

registerProcessor("rgb-full-synth", RgbFullSynth);
