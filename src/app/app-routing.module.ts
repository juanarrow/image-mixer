import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ImageComposerComponent } from './image-composer/image-composer.component';

const routes: Routes = [
  { path: 'image-composer', component: ImageComposerComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
