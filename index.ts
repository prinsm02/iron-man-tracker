import { registerRootComponent } from 'expo';

// The background GPS task must be defined before anything else runs, so iOS can wake the app
// with new locations while the screen is locked.
import './src/tracking/tracker.ts';
import App from './App';

registerRootComponent(App);
