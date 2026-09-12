export function mapPopup(title: string, address: string): HTMLElement {
  const popup = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const label = document.createElement('div');
  label.textContent = address;
  popup.append(heading, label);
  return popup;
}
