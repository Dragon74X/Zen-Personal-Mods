// Tab Router: hands a cancelled link click to the window that owns the tab.
export class ZzRouterLinksParent extends JSWindowActorParent {
  receiveMessage(message) {
    const browser = this.browsingContext?.top?.embedderElement;
    const win = browser?.ownerDocument?.defaultView;
    const router = win?.TabRouter;
    if (!router?.linkMessage) return;
    try {
      router.linkMessage(message.name, message.data || {}, browser, this.manager?.documentPrincipal);
    } catch (error) {
      console.error("[Tab Router] link switch failed:", error);
    }
  }
}
