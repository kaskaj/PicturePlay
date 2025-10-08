class RgbFullSynth extends AudioWorkletProcessor {
    constructor() {
        super();
        this.config = null;
        this.t = 0;
        this.samplesPerColumn = 0;
        this.durationPerColumn = 0.1;
        this.detuneAmount = 1;
        this.stereoWidth = 1;
        this.lastColumnReported = -1;

        this.port.onmessage = (event) => {
            if (event.data.type === "config") {
                this.config = event.data;
                this.durationPerColumn = event.data.durationPerColumn;
                this.detuneAmount = event.data.detuneAmount ?? 1;
                this.stereoWidth = event.data.stereoWidth ?? 1;
                this.samplesPerColumn = Math.max(1, Math.floor(
                    this.durationPerColumn * this.config.sampleRate
                ));
                this.t = 0;
                this.lastColumnReported = -1;
            } else if (event.data.type === "params" && this.config) {
                if (typeof event.data.durationPerColumn === "number") {
                    this.durationPerColumn = event.data.durationPerColumn;
                    this.samplesPerColumn = Math.max(1, Math.floor(
                        this.durationPerColumn * this.config.sampleRate
                    ));
                    this.config.durationPerColumn = this.durationPerColumn;
                }
                if (typeof event.data.detuneAmount === "number") {
                    this.detuneAmount = event.data.detuneAmount;
                    this.config.detuneAmount = this.detuneAmount;
                }
                if (typeof event.data.stereoWidth === "number") {
                    this.stereoWidth = event.data.stereoWidth;
                    this.config.stereoWidth = this.stereoWidth;
                }
                if (typeof event.data.baseFrequency === "number") {
                    this.config.baseFreq = event.data.baseFrequency;
                }
            } else if (event.data.type === "pixels" && this.config && event.data.pixelData) {
                this.config.pixelData = event.data.pixelData;
                this.lastColumnReported = -1;
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
            if (col !== this.lastColumnReported) {
                this.lastColumnReported = col;
                this.port.postMessage({type: "column", column: col});
            }
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

                // detune scaled by UI control (0-200%)
                const detuneRange = 0.1 * this.detuneAmount;
                const detuneFactor = 1 + (gVal - 0.5) * detuneRange;
                const freq = freqBase * detuneFactor;

                // phase = red channel maps to [0, 2π]
                const phase = rVal * 2 * Math.PI;

                // oscillator sample
                const s = amp * Math.sin(2 * Math.PI * freq * time + phase);

                // stereo pan scaled by UI control
                const pan = 0.5 + (bVal - 0.5) * this.stereoWidth;
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
