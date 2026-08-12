/**
 * Binary min-heap keyed by the A* f-score.
 * Replaces the previous "sort the open array on every pop" approach,
 * reducing node extraction from O(n log n) to O(log n).
 */
export class MinHeap {
    constructor() {
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    push(item) {
        this.items.push(item);
        this.bubbleUp(this.items.length - 1);
    }

    pop() {
        const top = this.items[0];
        const last = this.items.pop();
        if (this.items.length > 0) {
            this.items[0] = last;
            this.bubbleDown(0);
        }
        return top;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (this.items[parent].f <= this.items[index].f) {break;}
            [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
            index = parent;
        }
    }

    bubbleDown(index) {
        const length = this.items.length;
        for (;;) {
            const left = index * 2 + 1;
            const right = left + 1;
            let smallest = index;
            if (left < length && this.items[left].f < this.items[smallest].f) {smallest = left;}
            if (right < length && this.items[right].f < this.items[smallest].f) {smallest = right;}
            if (smallest === index) {break;}
            [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
            index = smallest;
        }
    }
}
