import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-countdown-timer',
  template: `
    <div class="fixed inset-0 flex items-center justify-center z-50 bg-black/30">
      <div class="relative h-[70vh] flex items-center justify-center">
        <div class="number-container">
          <span *ngIf="currentNumber" 
                class="text-[35vh] font-bold text-white number"
                [class.animate]="animate">
            {{currentNumber}}
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .number-container {
      position: relative;
      height: 35vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .number {
      position: absolute;
      opacity: 0;
      transform: scale(0.3);
    }

    .animate {
      animation: popIn 1s ease-out forwards;
    }

    @keyframes popIn {
      0% {
        opacity: 0;
        transform: scale(0.3);
      }
      20% {
        opacity: 1;
        transform: scale(1.4);
      }
      40% {
        transform: scale(1);
      }
      80% {
        opacity: 1;
        transform: scale(1);
      }
      100% {
        opacity: 0;
        transform: scale(0.3);
      }
    }
  `]
})
export class CountdownTimerComponent implements OnInit {
  @Input() startFrom: number = 5;
  @Output() finished = new EventEmitter<void>();
  
  currentNumber: number | null = null;
  animate = false;

  ngOnInit() {
    this.startCountdown();
  }

  private startCountdown() {
    let count = this.startFrom;
    
    const nextNumber = () => {
      if (count > 0) {
        this.currentNumber = count;
        this.animate = true;
        count--;
        
        // Preparar el siguiente número
        setTimeout(() => {
          this.animate = false;
          if (count > 0) {
            setTimeout(nextNumber, 50);
          } else {
            this.finished.emit();
          }
        }, 950);
      }
    };

    nextNumber();
  }
} 