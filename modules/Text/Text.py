from mellon.NodeBase import NodeBase

class Text(NodeBase):
    def execute(self, text_field):
        return text_field
    
class Text2(NodeBase):
    def execute(self, text_field):
        return text_field

class DisplayText(NodeBase):
    def execute(self, text_in, text_in_2):
        return {"text_out": text_in + text_in_2}
    
