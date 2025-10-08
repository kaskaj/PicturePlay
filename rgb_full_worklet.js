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
        this.attackTime = 0;
        this.releaseTime = 0;

        this.port.onmessage = (event) => {
            if (event.data.type === "config") {
                this.config = event.data;
                this.durationPerColumn = event.data.durationPerColumn;
                this.detuneAmount = event.data.detuneAmount ?? 1;
                this.stereoWidth = event.data.stereoWidth ?? 1;
                this.samplesPerColumn = Math.max(1, Math.floor(
                    this.durationPerColumn * this.config.sampleRate
                ));
                if (typeof event.data.baseFreq === "number") {
                    this.config.baseFreq = event.data.baseFreq;
                }
                this.setAttack(event.data.attackTime ?? this.attackTime);
                this.setRelease(event.data.releaseTime ?? this.releaseTime);
                this.config.attackTime = this.attackTime;
                this.config.releaseTime = this.releaseTime;
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
                if (typeof event.data.attackTime === "number") {
                    this.setAttack(event.data.attackTime);
                    this.config.attackTime = this.attackTime;
                }
                if (typeof event.data.releaseTime === "number") {
                    this.setRelease(event.data.releaseTime);
                    this.config.releaseTime = this.releaseTime;
                }
            } else if (event.data.type === "pixels" && this.config && event.data.pixelData) {
                this.config.pixelData = event.data.pixelData;
                this.lastColumnReported = -1;
            }
        };
    }

    setAttack(timeSeconds) {
        this.attackTime = Math.max(0, timeSeconds || 0);
    }

    setRelease(timeSeconds) {
        this.releaseTime = Math.max(0, timeSeconds || 0);
    }

    computeEnvelope(sampleIndex) {
        if (!this.config || !this.config.sampleRate) return 1;
        const total = this.samplesPerColumn || 0;
        if (total <= 0) return 1;
        const sr = this.config.sampleRate;

        let envelope = 1;
        const attackSamples = Math.min(total, Math.max(0, Math.round(this.attackTime * sr)));
        if (attackSamples > 0 && sampleIndex < attackSamples) {
            envelope = sampleIndex / attackSamples;
        }

        const releaseSamples = Math.min(total, Math.max(0, Math.round(this.releaseTime * sr)));
        if (releaseSamples > 0) {
            const releaseStart = Math.max(0, total - releaseSamples);
            if (sampleIndex >= releaseStart) {
                const remaining = total - sampleIndex;
                const releaseEnv = releaseSamples > 0 ? remaining / releaseSamples : 1;
                envelope = Math.min(envelope, releaseEnv);
            }
        }

        if (envelope < 0) envelope = 0;
        if (envelope > 1) envelope = 1;
        return envelope;
    }

    process(inputs, outputs) {
        if (!this.config) return true;

        const output = outputs[0];
        const L = output[0];
        const R = output[1] || output[0];

        const {pixelData, baseFreq, sampleRate} = this.config;
        if (!pixelData) return true;
        const {width, height, data} = pixelData;
        if (!width || !height) return true;


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

            const envelope = this.computeEnvelope(sampleIndex);

            for (let y = 0; y < height; y++) {
                const idx = (y * width + col) * 4;
                const rVal = data[idx] / 255;
                const gVal = data[idx + 1] / 255;
                const bVal = data[idx + 2] / 255;

                // amplitude = vector magnitude
                const baseAmp = Math.sqrt(rVal * rVal + gVal * gVal + bVal * bVal);
                const amp = baseAmp * envelope;
                if (amp < 0.0001) continue;

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
